import { Sequence } from "./expression";
import { Parser } from "./parser";
import { Capture, Group, Match } from "./result";
import { CaptureGroup, State } from "./state";

export interface RegexOptions
{
	flags?: string;
}

export class Regex
{
	private ast: Sequence;
	private groups: Map<string, CaptureGroup>;

	public constructor(regex: string, options: RegexOptions = {})
	{
		let flags = options.flags;
		if (flags !== undefined)
		{
			const invalidFlag = Parser.findInvalidFlag(flags);
			if (invalidFlag !== undefined)
			{
				throw new SyntaxError(`Invalid flag "${invalidFlag}" in regex options.`);
			}
		}
		else
		{
			flags = "";
		}
		({ sequence: this.ast, groups: this.groups } = new Parser(regex, flags).parse());
	}

	public match(input: string, startIndex: number = 0): Match
	{
		let match = this.getMatch(input, startIndex);
		if (match === undefined)
		{
			// If no match was found, return empty.
			match = new Match(new Map());
		}
		return match;
	}

	public matches(input: string, startIndex: number = 0): Match[]
	{
		const matches = [];
		for
		(
			let match = this.getMatch(input, startIndex);
			match !== undefined;
			match = this.getMatch(input, match.index + Math.max(1, match.length))
		)
		{
			matches.push(match);
		}
		return matches;
	}

	private getMatch(input: string, startIndex: number): Match | undefined
	{
		const state = new State(input, [...this.groups.values()]);
		for (let i = Math.max(0, Math.floor(startIndex)); i <= input.length; i++)
		{
			state.index = i;
			if (this.ast.match(state) !== undefined)
			{
				const groups = new Map<string, Group>
				(
					[...state.groups].map
					(
						([g, cs]) => [g.name, new Group(g.name, cs.map(c => new Capture(c.index, c.value)))] as [string, Group],
					),
				);
				const capture = new Capture(i, state.str.substring(i, state.index));
				return new Match(groups, capture);
			}
		}
	}
}
