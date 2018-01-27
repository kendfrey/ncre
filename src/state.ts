export class CaptureGroup
{
	public constructor(public readonly name: string)
	{

	}
}

export class CaptureValue
{
	public constructor(public readonly value: string, public readonly index: number)
	{

	}
}

export class State
{
	private currentIndex: number;
	private groups: Map<CaptureGroup, CaptureValue[]>;
	private stateStack: Array<{ index: number; direction: 1 | -1 }> = [];

	private constructor(private readonly str: string, groups: CaptureGroup[], private direction: 1 | -1)
	{
		this.groups = new Map(groups.map(g => [g, []] as [CaptureGroup, CaptureValue[]]));
	}

	public static create(str: string, groups: CaptureGroup[], direction: 1 | -1): StateAccessor
	{
		// This is to give the creator of the state access to the state's internals, and no one else.
		const state = new State(str, groups, direction);
		return {
			state,
			reset(index: number): void
			{
				state.currentIndex = index;
			},
			getString(): string
			{
				return state.str;
			},
			getGroups(): Map<CaptureGroup, CaptureValue[]>
			{
				return state.groups;
			},
			clearGroups(): void
			{
				for (const group of state.groups.keys())
				{
					state.groups.set(group, []);
				}
			},
		};
	}

	public get index(): number
	{
		return this.currentIndex;
	}

	public advance(count: number = 1): void
	{
		this.currentIndex += count * this.direction;
	}

	public backtrack(count: number = 1): void
	{
		this.currentIndex -= count * this.direction;
	}

	public peek(length: number = 1): string
	{
		return this.str.substring(this.currentIndex, this.currentIndex + length * this.direction);
	}

	public get endOfString(): boolean
	{
		if (this.direction === 1)
		{
			return this.currentIndex >= this.str.length;
		}
		else
		{
			return this.currentIndex <= 0;
		}
	}

	public get outOfBounds(): boolean
	{
		if (this.direction === 1)
		{
			return this.currentIndex > this.str.length;
		}
		else
		{
			return this.currentIndex < 0;
		}
	}

	public startAnchor(direction: 1 | -1): void
	{
		// Save the index and direction, but not captures.
		this.stateStack.push({ index: this.currentIndex, direction: this.direction });
		this.direction = direction;
	}

	public endAnchor(): void
	{
		// Restore the index and direction from before the anchor.
		({ index: this.currentIndex, direction: this.direction } = this.stateStack.pop()!);
	}

	public pushCapture(group: CaptureGroup, startIndex: number): void
	{
		this.groups.get(group)!.push(
			new CaptureValue(this.str.substring(startIndex, this.currentIndex), Math.min(startIndex, this.currentIndex))
		);
	}

	public peekCapture(group: CaptureGroup): string | undefined
	{
		const captures = this.groups.get(group)!;
		if (captures.length === 0)
		{
			return undefined;
		}
		return captures[captures.length - 1].value;
	}

	public popCapture(group: CaptureGroup): void
	{
		this.groups.get(group)!.pop();
	}
}

export interface StateAccessor
{
	state: State;
	reset(index: number): void;
	getString(): string;
	getGroups(): Map<CaptureGroup, CaptureValue[]>;
	clearGroups(): void;
}
