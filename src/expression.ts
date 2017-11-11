import { State } from "./state";

export interface Expression
{
	match(state: State): object | undefined;
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
		const index = this.backtrackInternal(state, tokens, tokens.length);
		if (index !== undefined)
		{
			return this.matchInternal(state, tokens, index);
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
		if (this.backtrackInternal(state, tokens))
		{
			return tokens;
		}
		else
		{
			return undefined;
		}
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
					if (!this.backtrackInternal(state, tokens))
					{
						return undefined;
					}
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
					if (!this.backtrackInternal(state, tokens))
					{
						return undefined;
					}
				}
			}
		}
		return tokens;
	}

	private backtrackInternal(state: State, tokens: object[]): boolean
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
				return true;
			}
		}
		// If no match was found, the backtrack failed.
		return false;
	}
}

export class Character implements Expression
{
	public constructor(private readonly char: string)
	{

	}

	public match(state: State): object | undefined
	{
		if (state.str[state.index] === this.char)
		{
			state.index++;
			return {};
		}
		else
		{
			return undefined;
		}
	}

	public backtrack(state: State): object | undefined
	{
		state.index--;
		return undefined;
	}
}
