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

	public match(input: string): Match
	{
		const state = new State(input, [...this.groups.values()]);
		for (let i = 0; i <= input.length; i++)
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
		// If no match was found, return empty.
		return new Match(new Map());
	}
}
