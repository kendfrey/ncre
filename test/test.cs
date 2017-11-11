using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Text.RegularExpressions;

namespace Ncre
{
	class Test
	{
		public Task<object> Match(dynamic data)
		{
			return Task.FromResult<object>(new MatchDto(Regex.Match(data.input, data.regex)));
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
		public GroupDto(Group group) : base(group)
		{
			this.group = group;
		}

		public IEnumerable<CaptureDto> captures => group.Captures.Cast<Capture>().Select(c => new CaptureDto(c));
		public string name => group.Name;
		public bool success => group.Success;
	}

	class MatchDto : GroupDto
	{
		Match match;
		public MatchDto(Match match) : base(match)
		{
			this.match = match;
		}

		public IEnumerable<CaptureDto> groups => match.Groups.Cast<Group>().Select(g => new GroupDto(g));
	}
}