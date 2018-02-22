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

	// This backtracks without trying to find another match.
	discard(state: State, token: Token): void;

	// This converts the expression to right-to-left mode or vice versa.
	invert(): void;
}

// This class is used as a placeholder for an expression that will be inserted after the parse.
export class Proxy implements Expression
{
	// This gets populated after the parse, instead of in the constructor.
	private expression!: Expression;
	private inverted = false;

	public match(state: State): Token | undefined
	{
		return this.expression.match(state);
	}

	public backtrack(state: State, token: Token): Token | undefined
	{
		return this.expression.backtrack(state, token);
	}

	public discard(state: State, token: Token): void
	{
		this.expression.discard(state, token);
	}

	public invert(): void
	{
		// This defers the inversion until the expression is set.
		this.inverted = !this.inverted;
	}

	public setExpression(expression: Expression): void
	{
		this.expression = expression;
		if (this.inverted)
		{
			this.expression.invert();
		}
	}
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

	public discard(state: State, tokens: Token[]): void
	{
		for (let i = this.atoms.length - 1; i >= 0; i--)
		{
			this.atoms[i].discard(state, tokens[i]);
		}
	}

	public invert(): void
	{
		this.atoms.reverse();
		this.atoms.forEach(a => a.invert());
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

	public discard(state: State, tokens: Token[]): void
	{
		for (let i = tokens.length - 1; i >= 0; i--)
		{
			this.atom.discard(state, tokens[i]);
		}
	}

	public invert(): void
	{
		this.atom.invert();
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

	public discard(state: State, { side, token }: { side: "left" | "right"; token: Token }): void
	{
		if (side === "left")
		{
			this.left.discard(state, token);
		}
		else
		{
			this.right.discard(state, token);
		}
	}

	public invert(): void
	{
		this.left.invert();
		this.right.invert();
	}
}

export class Character implements Expression
{
	public constructor(
		private readonly filter: (character: string) => boolean,
		private readonly ignoreCase: boolean = false)
	{

	}

	public match(state: State): {} | undefined
	{
		if (!state.endOfString && this.testFilter(state.peek()))
		{
			state.advance();
			return {};
		}
		else
		{
			return undefined;
		}
	}

	public backtrack(state: State, token: {}): undefined
	{
		state.backtrack();
		return;
	}

	public discard(state: State, token: {}): void
	{
		state.backtrack();
	}

	public invert(): void
	{
		// Do nothing
	}

	private testFilter(character: string): boolean
	{
		if (this.ignoreCase)
		{
			return this.filter(character.toLowerCase()) || this.filter(character.toUpperCase());
		}
		else
		{
			return this.filter(character);
		}
	}
}

export class Group implements Expression
{
	// This gets populated after the parse, instead of in the constructor.
	public group!: CaptureGroup;

	public constructor(private readonly atom: Expression, group?: CaptureGroup)
	{
		if (group !== undefined)
		{
			this.group = group;
		}
	}

	public match(state: State): { start: number; token: Token } | undefined
	{
		const start = state.index;
		const token = this.atom.match(state);
		if (token !== undefined)
		{
			// If a match is found, store it as a capture.
			state.pushCapture(this.group, start);
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
		state.popCapture(this.group);

		const newToken = this.atom.backtrack(state, token);
		if (newToken !== undefined)
		{
			// If a match is found, store it as a capture.
			state.pushCapture(this.group, start);
			return { start, token: newToken };
		}
		else
		{
			return undefined;
		}
	}

	public discard(state: State, { token }: { token: Token }): void
	{
		// Remove the previous capture.
		state.popCapture(this.group);
		this.atom.discard(state, token);
	}

	public invert(): void
	{
		this.atom.invert();
	}
}

export class BalancingGroup implements Expression
{
	// These get populated after the parse, instead of in the constructor.
	public popGroup!: CaptureGroup;
	public pushGroup: CaptureGroup | undefined;

	public constructor(private readonly atom: Expression)
	{

	}

	public match(state: State): { start: number; capture: CaptureValue; token: Token } | undefined
	{
		if (!state.hasCapture(this.popGroup))
		{
			// If no capture exists to balance with, fail the match.
			return undefined;
		}
		const start = state.index;
		const token = this.atom.match(state);
		if (token !== undefined)
		{
			// If a match is found, pop the old capture and make a new capture with the text in between.
			const capture = this.balanceCapture(state, start, token);
			return { start, capture, token };
		}
		else
		{
			return undefined;
		}
	}

	public backtrack(state: State, { start, capture, token }: { start: number; capture: CaptureValue; token: Token })
		: { start: number; capture: CaptureValue; token: Token } | undefined
	{
		this.backtrackBalanceCapture(state, capture);
		const newToken = this.atom.backtrack(state, token);
		if (newToken !== undefined)
		{
			// If a match is found, pop the old capture and make a new capture with the text in between.
			const newCapture = this.balanceCapture(state, start, newToken);
			return { start, capture: newCapture, token: newToken };
		}
		else
		{
			return undefined;
		}
	}

	public discard(state: State, { start, capture, token }: { start: number; capture: CaptureValue; token: Token }): void
	{
		this.backtrackBalanceCapture(state, capture);
		this.atom.discard(state, token);
	}

	public invert(): void
	{
		this.atom.invert();
	}

	private balanceCapture(state: State, start: number, token: Token): CaptureValue
	{
		const capture = state.popCapture(this.popGroup);
		if (this.pushGroup !== undefined)
		{
			// Take the middle two indices, to get either the text between the two matches, or the overlap of the matches.
			const indices = [capture.index, capture.index + capture.value.length, start, state.index];
			indices.sort((a, b) => a - b);
			const [, startIndex, endIndex, ]: number[] = indices;

			// Push the text as a new capture.
			state.pushCapture(this.pushGroup, startIndex, endIndex);
		}
		return capture;
	}

	private backtrackBalanceCapture(state: State, capture: CaptureValue): void
	{
		if (this.pushGroup !== undefined)
		{
			// Remove the balancing capture.
			state.popCapture(this.pushGroup);
		}
		// Restore the capture that was balanced with.
		state.repushCapture(this.popGroup, capture);
	}
}

export class Reference implements Expression
{
	// This gets populated after the parse, instead of in the constructor.
	public group!: CaptureGroup;

	public constructor(private readonly ignoreCase: boolean, group?: CaptureGroup)
	{
		if (group !== undefined)
		{
			this.group = group;
		}
	}

	public match(state: State): number | undefined
	{
		// Look up the string to be captured.
		const capture = state.peekCapture(this.group);
		if (capture === undefined)
		{
			// If the group has no captures, fail.
			return undefined;
		}

		let success;
		if (this.ignoreCase)
		{
			// Look for the capture, ignoring case.
			success = state.peek(capture.length).toLowerCase() === capture.toLowerCase();
		}
		else
		{
			// Look for the capture.
			success = state.peek(capture.length) === capture;
		}

		if (success)
		{
			state.advance(capture.length);
			return capture.length;
		}
		else
		{
			return undefined;
		}
	}

	public backtrack(state: State, token: number): undefined
	{
		state.backtrack(token);
		return;
	}

	public discard(state: State, token: number): void
	{
		state.backtrack(token);
	}

	public invert(): void
	{
		// Do nothing
	}
}

export class Anchor implements Expression
{
	public constructor(
		private left: Expression | undefined,
		private right: Expression | undefined,
		private readonly condition: (state: State, left: boolean, right: boolean) => boolean
	)
	{

	}

	public match(state: State): { left?: Token; right?: Token } | undefined
	{
		let leftToken;
		let rightToken;
		if (this.left !== undefined)
		{
			// If there is a lookbehind, evaluate it.
			state.startAnchor(-1);
			leftToken = this.left.match(state);
			state.endAnchor();
		}
		if (this.right !== undefined)
		{
			// If there is a lookahead, evaluate it.
			state.startAnchor(1);
			rightToken = this.right.match(state);
			state.endAnchor();
		}

		// Evaluate the condition for the anchor to match
		if (this.condition(state, leftToken !== undefined, rightToken !== undefined))
		{
			return { left: leftToken, right: rightToken };
		}
		else
		{
			return undefined;
		}
	}

	public backtrack(state: State, token: { left?: Token; right?: Token }): undefined
	{
		this.discard(state, token);
		return;
	}

	public discard(state: State, token: { left?: Token; right?: Token }): void
	{
		if (token.left !== undefined)
		{
			state.startAnchor(-1);
			this.left!.discard(state, token.left);
			state.endAnchor();
		}
		if (token.right !== undefined)
		{
			state.startAnchor(1);
			this.right!.discard(state, token.right);
			state.endAnchor();
		}
	}

	public invert(): void
	{
		// Do nothing
	}

	public invertAnchor(): void
	{
		// Change the direction of the anchor.
		const tmp = this.left;
		this.left = this.right;
		this.right = tmp;

		if (this.left !== undefined)
		{
			this.left.invert();
		}
		if (this.right !== undefined)
		{
			this.right.invert();
		}
	}
}

export class Atomic implements Expression
{
	public constructor(private readonly expression: Expression)
	{

	}

	public match(state: State): Token | undefined
	{
		return this.expression.match(state);
	}

	public backtrack(state: State, token: Token): undefined
	{
		// Atomic groups never backtrack.
		this.discard(state, token);
		return;
	}

	public discard(state: State, token: Token): void
	{
		this.expression.discard(state, token);
	}

	public invert(): void
	{
		this.expression.invert();
	}
}

export class Conditional implements Expression
{
	// These get populated after the parse, instead of in the constructor.
	public condition!: CaptureGroup | Anchor;
	public isImplicitLookahead = false;

	public constructor(private readonly left: Expression, private readonly right: Expression)
	{

	}

	public match(state: State): { side: "left" | "right"; matchToken: Token; anchorToken?: Token } | undefined
	{
		// Evaluate the condition.
		let condition;
		let anchorToken;
		if (this.condition instanceof CaptureGroup)
		{
			condition = state.hasCapture(this.condition);
		}
		else
		{
			anchorToken = this.condition.match(state);
			condition = anchorToken !== undefined;
		}

		// Match the appropriate side.
		const side: "left" | "right" = condition ? "left" : "right";
		let matchToken;
		if (condition)
		{
			matchToken = this.left.match(state);
		}
		else
		{
			matchToken = this.right.match(state);
		}

		return this.finishMatch(state, side, matchToken, anchorToken);
	}

	public backtrack(
		state: State,
		{ side, matchToken, anchorToken }: { side: "left" | "right"; matchToken: Token; anchorToken?: Token }
	): { side: "left" | "right"; matchToken: Token; anchorToken?: Token } | undefined
	{
		let newMatchToken;
		if (side === "left")
		{
			newMatchToken = this.left.backtrack(state, matchToken);
		}
		else
		{
			newMatchToken = this.right.backtrack(state, matchToken);
		}

		return this.finishMatch(state, side, newMatchToken, anchorToken);
	}

	public discard(
		state: State,
		{ side, matchToken, anchorToken }: { side: "left" | "right"; matchToken: Token; anchorToken?: Token }
	): void
	{
		if (side === "left")
		{
			this.left.discard(state, matchToken);
		}
		else
		{
			this.right.discard(state, matchToken);
		}

		// Discard the anchor token.
		this.finishMatch(state, side, undefined, anchorToken);
	}

	public invert(): void
	{
		this.left.invert();
		this.right.invert();
		if (this.isImplicitLookahead)
		{
			(this.condition as Anchor).invertAnchor();
		}
	}

	private finishMatch(state: State, side: "left" | "right", matchToken?: Token, anchorToken?: Token)
		: { side: "left" | "right"; matchToken: Token; anchorToken?: Token } | undefined
	{
		if (matchToken !== undefined)
		{
			return { side, matchToken, anchorToken };
		}
		else
		{
			// Before discarding, discard the anchor token.
			if (anchorToken !== undefined)
			{
				(this.condition as Anchor).discard(state, anchorToken);
			}
			return undefined;
		}
	}
}
