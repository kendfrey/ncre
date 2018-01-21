import { CaptureGroup, CaptureValue, State } from "./state";

interface Token
{

}

export interface Expression
{
	// Tokens represent the "state" of an expression.
	// Each successful candidate match returns a token which can later be passed to backtrack if backtracking is required.

	// This tries to find the first possible match and returns a token if successful.
	match(state: State): Token | undefined;

	// This takes a token and tries to find the next possible match by backtracking.
	backtrack(state: State, token: Token): Token | undefined;
}

export class Sequence implements Expression
{
	public constructor(private readonly atoms: Expression[])
	{

	}

	public match(state: State): Token[] | undefined
	{
		return this.matchInternal(state, new Array(this.atoms.length), 0);
	}

	public backtrack(state: State, tokens: Token[]): Token[] | undefined
	{
		// Backtrack until a match is found.
		const index = this.backtrackInternal(state, tokens, tokens.length - 1);
		if (index !== undefined)
		{
			return this.matchInternal(state, tokens, index + 1);
		}
		else
		{
			return undefined;
		}
	}

	private matchInternal(state: State, tokens: Token[], startAt: number): Token[] | undefined
	{
		// Match forward through items in the sequence.
		for (let i = startAt; i < this.atoms.length; i++)
		{
			const token = this.atoms[i].match(state);
			if (token !== undefined)
			{
				// If it succeeded, store the token and continue.
				tokens[i] = token;
			}
			else
			{
				const index = this.backtrackInternal(state, tokens, i - 1);
				if (index !== undefined)
				{
					i = index;
				}
				else
				{
					return undefined;
				}
			}
		}
		return tokens;
	}

	private backtrackInternal(state: State, tokens: Token[], startAt: number): number | undefined
	{
		// Backtrack until a match is found.
		for (let i = startAt; i >= 0; i--)
		{
			// Try to find a match by backtracking.
			const token = this.atoms[i].backtrack(state, tokens[i]);
			if (token !== undefined)
			{
				// If it succeeded, the backtrack succeeded.
				tokens[i] = token;
				return i;
			}
		}
		// If no match was found, the backtrack failed.
		return undefined;
	}
}

export class Repetition implements Expression
{
	public constructor(
		private readonly atom: Expression,
		private readonly min: number,
		private readonly max: number,
		private readonly lazy: boolean
	)
	{

	}

	public match(state: State): Token[] | undefined
	{
		return this.matchInternal(state, []);
	}

	public backtrack(state: State, tokens: Token[]): Token[] | undefined
	{
		// Try to match more times, if available.
		if (this.lazy && tokens.length < this.max)
		{
			const token = this.atom.match(state);
			if (token !== undefined)
			{
				// If it succeeded, that's the next match!
				tokens.push(token);
				return tokens;
			}
		}
		return this.backtrackInternal(state, tokens);
	}

	private matchInternal(state: State, tokens: Token[]): Token[] | undefined
	{
		if (this.lazy)
		{
			// Try to match the minimum number of repetitions.
			while (tokens.length < this.min)
			{
				// Match an iteration.
				const token = this.atom.match(state);
				if (token !== undefined)
				{
					// If it succeeded, store the token and continue.
					tokens.push(token);
				}
				else
				{
					// Try to backtrack to another match.
					return this.backtrackInternal(state, tokens);
				}
			}
		}
		else
		{
			// Try to match the maximum number of repetitions.
			while (tokens.length < this.max)
			{
				const previousIndex = state.index;

				// Match an iteration.
				const token = this.atom.match(state);
				if (token !== undefined)
				{
					// If it succeeded, store the token and continue.
					tokens.push(token);
				}
				else if (tokens.length >= this.min)
				{
					// If it failed but the minimum has been reached, success!
					return tokens;
				}
				else
				{
					// Try to backtrack to another match.
					return this.backtrackInternal(state, tokens);
				}

				// If the match hasn't advanced, terminate it to prevent an infinite loop.
				if (state.index === previousIndex && tokens.length >= this.min)
				{
					return tokens;
				}
			}
		}
		return tokens;
	}

	private backtrackInternal(state: State, tokens: Token[]): Token[] | undefined
	{
		// Backtrack until a match is found.
		while (tokens.length > 0)
		{
			// Try to find a match by backtracking.
			const token = this.atom.backtrack(state, tokens.pop()!);
			if (token !== undefined)
			{
				// If it succeeded, the backtrack succeeded.
				tokens.push(token);
				return this.matchInternal(state, tokens);
			}
			else if (!this.lazy && tokens.length >= this.min)
			{
				// If it's greedy, backtrack to one less repetition.
				return tokens;
			}
		}
		return undefined;
	}
}

export class Alternation implements Expression
{
	public constructor(private readonly left: Expression, private readonly right: Expression)
	{

	}

	public match(state: State): { side: "left" | "right"; token: Token } | undefined
	{
		// Try the left side first.
		let token = this.left.match(state);
		if (token !== undefined)
		{
			return { side: "left", token };
		}
		// Try the right side last.
		token = this.right.match(state);
		if (token !== undefined)
		{
			return { side: "right", token };
		}
		return undefined;
	}

	public backtrack(state: State, { side, token }: { side: "left" | "right"; token: Token })
		: { side: "left" | "right"; token: Token } | undefined
	{
		if (side === "left")
		{
			// If the last match came from the left side, backtrack it.
			let newToken = this.left.backtrack(state, token);
			if (newToken !== undefined)
			{
				return { side: "left", token: newToken };
			}
			// If that failed, try the right side.
			newToken = this.right.match(state);
			if (newToken !== undefined)
			{
				return { side: "right", token: newToken };
			}
			return undefined;
		}
		else
		{
			// If the last match came from the right side, backtrack it.
			const newToken = this.right.backtrack(state, token);
			if (newToken !== undefined)
			{
				return { side: "right", token: newToken };
			}
			return undefined;
		}
	}
}

export class Character implements Expression
{
	public constructor(private readonly filter: (character: string) => boolean)
	{

	}

	public match(state: State): {} | undefined
	{
		if (state.index < state.str.length && this.filter(state.str[state.index]))
		{
			state.index++;
			return {};
		}
		else
		{
			return undefined;
		}
	}

	public backtrack(state: State, token: {}): undefined
	{
		state.index--;
		return;
	}
}

export class Group implements Expression
{
	public constructor(private readonly atom: Expression, private readonly group: CaptureGroup)
	{

	}

	public match(state: State): { start: number; token: Token } | undefined
	{
		const start = state.index;
		const token = this.atom.match(state);
		if (token !== undefined)
		{
			// If a match is found, store it as a capture.
			state.groups.get(this.group)!.push(new CaptureValue(state.str.substring(start, state.index), start));
			return { start, token };
		}
		else
		{
			return undefined;
		}
	}

	public backtrack(state: State, { start, token }: { start: number; token: Token })
		: { start: number; token: Token } | undefined
	{
		// Remove the previous capture.
		state.groups.get(this.group)!.pop();

		const newToken = this.atom.backtrack(state, token);
		if (newToken !== undefined)
		{
			// If a match is found, store it as a capture.
			state.groups.get(this.group)!.push(new CaptureValue(state.str.substring(start, state.index), start));
			return { start, token: newToken };
		}
		else
		{
			return undefined;
		}
	}
}

export class Reference implements Expression
{
	// This gets populated after the parse, instead of in the constructor.
	public group: CaptureGroup;

	public constructor(private readonly ignoreCase: boolean)
	{

	}

	public match(state: State): number | undefined
	{
		// Look up the string to be captured.
		const captures = state.groups.get(this.group)!;
		if (captures.length === 0)
		{
			// If the group has no captures, fail.
			return undefined;
		}
		const capture = captures[captures.length - 1].value;

		let success;
		if (this.ignoreCase)
		{
			// Look for the capture, ignoring case.
			success = state.str.substr(state.index, capture.length).toLowerCase() === capture.toLowerCase();
		}
		else
		{
			// Look for the capture.
			success = state.str.substr(state.index, capture.length) === capture;
		}

		if (success)
		{
			state.index += capture.length;
			return capture.length;
		}
		else
		{
			return undefined;
		}
	}

	public backtrack(state: State, token: number): undefined
	{
		state.index -= token;
		return;
	}
}
