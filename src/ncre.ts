import { Expression } from "./expression";
import { Parser } from "./parser";
import { Capture, Group, Match } from "./result";
import { CaptureGroup, State, StateAccessor } from "./state";
import { optional } from "./utils";

export interface RegexOptions
{
	flags?: string;
	rightToLeft?: boolean;
}

export class Regex
{
	public readonly rightToLeft: boolean;
	private readonly direction: 1 | -1;
	private readonly ast: Expression;
	private readonly groups: Map<string, CaptureGroup>;

	public constructor(regex: string, options: RegexOptions = {})
	{
		const flags = optional(options.flags, "");
		const invalidFlag = Parser.findInvalidFlag(flags);
		if (invalidFlag !== undefined)
		{
			throw new SyntaxError(`Invalid flag "${invalidFlag}" in regex options.`);
		}
		({ expression: this.ast, groups: this.groups } = new Parser(regex, flags).parse());
		this.rightToLeft = optional(options.rightToLeft, false);
		if (this.rightToLeft)
		{
			this.ast.invert();
		}
		this.direction = this.rightToLeft ? -1 : 1;
	}

	public match(input: string, startIndex?: number): Match
	{
		// If no match was found, return empty.
		return optional(this.getMatch(input, startIndex), { match: new Match(new Map()) }).match;
	}

	public matches(input: string, startIndex?: number): Match[]
	{
		const matches = [];
		for
		(
			let matchInfo = this.getMatch(input, startIndex);
			matchInfo !== undefined;
			matchInfo = this.getMatch(input, matchInfo.lastIndex)
		)
		{
			matches.push(matchInfo.match);

			if (matchInfo.match.length === 0)
			{
				// If the last match was empty, check the next character, to avoid an infinite loop.
				matchInfo.lastIndex += this.direction;
			}
		}
		return matches;
	}

	private getMatch(input: string, startIndex?: number): { match: Match; lastIndex: number } | undefined
	{
		// Get the specified start index.
		const intStartIndex = Math.floor(optional(startIndex, this.rightToLeft ? input.length : 0));
		// Clamp the specified start index to the string's bounds.
		const actualStartIndex = this.rightToLeft ? Math.min(input.length, intStartIndex) : Math.max(0, intStartIndex);
		// Create the state.
		const { state, ...stateAccessor }: StateAccessor = State.create(input, [...this.groups.values()], this.direction);

		// Loop through searching for a match.
		for (let i = actualStartIndex; i <= input.length; i += this.direction)
		{
			stateAccessor.reset(i);
			if (this.ast.match(state) !== undefined)
			{
				const groups = new Map<string, Group>
				(
					[...stateAccessor.getGroups()].map
					(
						([g, cs]) => [g.name, new Group(g.name, cs.map(c => new Capture(c.index, c.value)))] as [string, Group]
					)
				);
				const capture = new Capture(Math.min(i, state.index), stateAccessor.getString().substring(i, state.index));
				return { match: new Match(groups, capture), lastIndex: state.index };
			}
		}
	}
}
