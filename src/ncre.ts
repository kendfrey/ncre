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
		const stateAccessor = this.createState(input, startIndex);
		// If no match was found, return empty.
		return optional(this.getMatch(stateAccessor), new Match(new Map()));
	}

	public matches(input: string, startIndex?: number): Match[]
	{
		const stateAccessor = this.createState(input, startIndex);
		const matches = [];
		for
		(
			let match = this.getMatch(stateAccessor);
			match !== undefined;
			match = this.getMatch(stateAccessor)
		)
		{
			matches.push(match);

			if (match.length === 0)
			{
				// If the last match was empty, check the next character, to avoid an infinite loop.
				stateAccessor.state.advance();
			}
		}
		return matches;
	}

	private createState(input: string, startIndex?: number): StateAccessor
	{
		const index = Math.floor(optional(startIndex, this.rightToLeft ? input.length : 0));
		return State.create(input, [...this.groups.values()], index, this.direction);
	}

	private getMatch(stateAccessor: StateAccessor): Match | undefined
	{
		// Loop through searching for a match.
		for (; !stateAccessor.state.outOfBounds; stateAccessor.state.advance())
		{
			const startIndex = stateAccessor.index;
			if (this.ast.match(stateAccessor.state) !== undefined)
			{
				// If a match is found, return it.
				const groups = new Map<string, Group>
				(
					[...stateAccessor.groups].map
					(
						([g, cs]) => [g.name, new Group(g.name, cs.map(c => new Capture(c.index, c.value)))] as [string, Group]
					)
				);
				const capture = new Capture
				(
					Math.min(startIndex, stateAccessor.index),
					stateAccessor.str.substring(startIndex, stateAccessor.index)
				);
				stateAccessor.finishMatch();
				return new Match(groups, capture);
			}
		}
	}
}
