import { Sequence } from "./expression";
import { Parser } from "./parser";
import { Capture, Group, Match } from "./result";
import { State } from "./state";

export class Regex
{
	private ast: Sequence;

	public constructor(regex: string)
	{
		this.ast = new Parser(regex).parseSeq();
	}

	public match(input: string): Match
	{
		const state = new State(input);
		for (let i = 0; i <= input.length; i++)
		{
			state.index = i;
			if (this.ast.match(state) !== undefined)
			{
				const capture = new Capture();
				capture.value = state.str.substring(i, state.index);
				capture.index = i;
				capture.length = state.index - i;

				const group = new Group();
				Object.assign(group, capture);
				group.name = "0";
				group.success = true;
				group.captures = [capture];

				const match = new Match();
				Object.assign(match, group);
				match.groups = [group];

				return match;
			}
		}
		// If no match was found, return empty.
		return new Match();
	}
}
