import { CaptureGroup, CaptureValue, State } from "./state";

export interface Expression
{
	// Tokens represent the "state" of an expression.
	// Each successful candidate match returns a token which can later be passed to backtrack if backtracking is required.

	// This tries to find the first possible match and returns a token if successful.
	match(state: State): object | undefined;

	// This takes a token and tries to find the next possible match by backtracking.
	backtrack(state: State, token: object): object | undefined;
}

export class Sequence implements Expression
{
	public constructor(private readonly atoms: Expression[])
	{

	}

	public match(state: State): object[] | undefined
	{
		return this.matchInternal(state, new Array(this.atoms.length), 0);
	}

	public backtrack(state: State, tokens: object[]): object[] | undefined
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

	private matchInternal(state: State, tokens: object[], startAt: number): object[] | undefined
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

	private backtrackInternal(state: State, tokens: object[], startAt: number): number | undefined
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
		private readonly lazy: boolean,
	)
	{

	}

	public match(state: State): object[] | undefined
	{
		return this.matchInternal(state, []);
	}

	public backtrack(state: State, tokens: object[]): object[] | undefined
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

	private matchInternal(state: State, tokens: object[]): object[] | undefined
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
			}
		}
		return tokens;
	}

	private backtrackInternal(state: State, tokens: object[]): object[] | undefined
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

export class Character implements Expression
{
	public constructor(private readonly filter: (character: string) => boolean)
	{

	}

	public match(state: State): object | undefined
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

	public backtrack(state: State, token: object): object | undefined
	{
		state.index--;
		return undefined;
	}
}

export class Group implements Expression
{
	public constructor(private readonly atom: Sequence, private readonly group: CaptureGroup)
	{

	}

	public match(state: State): { start: number; token: object[] } | undefined
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

	public backtrack(state: State, { start, token }: { start: number; token: object[] })
		: { start: number; token: object[] } | undefined
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
