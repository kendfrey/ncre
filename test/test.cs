using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Text.RegularExpressions;

namespace Ncre
{
	class Test
	{
		public Task<object> Parse(dynamic data)
		{
			var regex = GetRegex(data);
			return Task.FromResult<object>(regex);
		}

		public Task<object> Match(dynamic data)
		{
			Regex regex = GetRegex(data);
			string input = data.input;
			return Task.FromResult<object>(new MatchDto(regex, regex.Match(input)));
		}

		public Task<object> Matches(dynamic data)
		{
			Regex regex = GetRegex(data);
			string input = data.input;
			return Task.FromResult<object>(regex.Matches(input).Cast<Match>().Select(m => new MatchDto(regex, m)));
		}

		public Task<object> Replace(dynamic data)
		{
			Regex regex = GetRegex(data);
			string input = data.input;
			string replacement = data.replacement;
			return Task.FromResult<object>(regex.Replace(input, replacement));
		}

		private Regex GetRegex(dynamic data)
		{
			RegexOptions options = RegexOptions.None;
			if (((IDictionary<string, object>)data).TryGetValue("options", out object dataOptionsObj)
				&& dataOptionsObj is IDictionary <string, object> dataOptions)
			{
				if (dataOptions.TryGetValue("rightToLeft", out object rightToLeft) && rightToLeft is true)
				{
					options |= RegexOptions.RightToLeft;
				}
				if (dataOptions.TryGetValue("flags", out object flags))
				{
					foreach (char flag in (flags as string).ToLower())
					{
						switch (flag)
						{
							case 'i':
								options |= RegexOptions.IgnoreCase;
								break;
							case 'm':
								options |= RegexOptions.Multiline;
								break;
							case 'n':
								options |= RegexOptions.ExplicitCapture;
								break;
							case 's':
								options |= RegexOptions.Singleline;
								break;
							case 'x':
								options |= RegexOptions.IgnorePatternWhitespace;
								break;
							default:
								throw new ArgumentException($"Invalid flag {flag}.", "options");
						}
					}
				}
			}
			return new Regex(data.regex, options);
		}
	}

	// Because of the circular reference with Match.Groups[0], let's wrap the entire structure in a DTO so we can fool edge into serializing it.
	class CaptureDto
	{
		Capture capture;
		public CaptureDto(Capture capture)
		{
			this.capture = capture;
		}

		public int index => capture.Index;
		public int length => capture.Length;
		public string value => capture.Value;
	}

	class GroupDto : CaptureDto
	{
		Group group;
		public GroupDto(Group group, string name = null) : base(group)
		{
			this.group = group;
			this.name = name ?? group.Name;
		}

		public IEnumerable<CaptureDto> captures => group.Captures.Cast<Capture>().Select(c => new CaptureDto(c));
		public string name { get; set; }
		public bool success => group.Success;
	}

	class MatchDto : GroupDto
	{
		Regex regex;
		Match match;
		public MatchDto(Regex regex, Match match) : base(match)
		{
			this.regex = regex;
			this.match = match;
		}

		public IEnumerable<GroupDto> groups
		{
			get
			{
				if (match.Success)
				{
					// This is a workaround for https://connect.microsoft.com/VisualStudio/feedback/details/3144058
					return regex.GetGroupNames().Select(n => new GroupDto(match.Groups[n], n));
				}
				else
				{
					return match.Groups.Cast<Group>().Select(g => new GroupDto(g));
				}
			}
		}
	}
}