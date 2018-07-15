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

	public match(input: string, startIndex?: number, length?: number): Match
	{
		const stateAccessor = this.createState(input, startIndex, length);
		// If no match was found, return empty.
		return optional(this.getMatch(stateAccessor), Match.empty);
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

	public replace(
		input: string,
		replacement: string | ((m: Match) => string),
		count: number = -1,
		startIndex?: number
	): string
	{
		if (count < -1)
		{
			throw new Error("Count cannot be less than -1.");
		}

		// Get the function to evaluate replacements.
		let replacementFunc: (m: Match) => string;
		if (typeof replacement === "string")
		{
			replacementFunc = (m: Match): string => m.result(replacement);
		}
		else
		{
			replacementFunc = replacement;
		}

		// Get at most <count> matches.
		const matches = this.matches(input, startIndex);
		if (count >= 0)
		{
			matches.splice(count);
		}

		// Make sure the match list goes from left to right.
		if (this.rightToLeft)
		{
			matches.reverse();
		}

		// Split the string up into replacements and the intermediate strings.
		const substrings = [];
		let index = 0;
		for (const match of matches)
		{
			substrings.push(input.substring(index, match.index));
			substrings.push(replacementFunc(match));
			index = match.index + match.length;
		}
		substrings.push(input.substr(index));

		// Re-concatenate the pieces.
		return substrings.join("");
	}

	public split(
		input: string,
		count: number = 0,
		startIndex?: number
	): string[]
	{
		if (count < 0)
		{
			throw new Error("Count cannot be less than 0.");
		}

		// Get at most <count - 1> matches.
		const matches = this.matches(input, startIndex);
		if (count > 0)
		{
			matches.splice(count - 1);
		}

		// Make sure the match list goes from left to right.
		if (this.rightToLeft)
		{
			matches.reverse();
		}

		// Split the string.
		const substrings = [];
		let index = 0;
		for (const match of matches)
		{
			substrings.push(input.substring(index, match.index));
			index = match.index + match.length;
		}
		substrings.push(input.substr(index));

		// Return the result.
		return substrings;
	}

	private createState(input: string, start?: number, length?: number): StateAccessor
	{
		let leftIndex = 0;
		let rightIndex = input.length;
		let startIndex;

		if (start !== undefined)
		{
			if (length !== undefined)
			{
				leftIndex = start;
				rightIndex = start + length;
				startIndex = this.rightToLeft ? rightIndex : leftIndex;
			}
			else
			{
				startIndex = start;
			}
		}
		else
		{
			startIndex = this.rightToLeft ? rightIndex : leftIndex;
		}

		return State.create(input, [...this.groups.values()], startIndex, leftIndex, rightIndex, this.direction);
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
				let nextIndex = stateAccessor.index;
				if (capture.length === 0)
				{
					// If the last match was empty, check the next character, to avoid an infinite loop.
					nextIndex += stateAccessor.direction;
				}
				return new Match(groups, capture, this, stateAccessor.str, nextIndex);
			}
		}
	}
}
