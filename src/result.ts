import { Regex } from "./ncre";

export class Capture
{
	public index: number;
	public length: number;
	public value: string;

	public constructor(index: number, value: string)
	{
		this.index = index;
		this.length = value.length;
		this.value = value;
	}
}

export class Group
{
	public captures: Capture[];
	public name: string;
	public success: boolean;
	public index: number;
	public length: number;
	public value: string;

	public constructor(name: string, captures: Capture[])
	{
		this.name = name;
		this.captures = captures;
		if (captures.length > 0)
		{
			this.success = true;
			const lastCapture = captures[captures.length - 1];
			this.index = lastCapture.index;
			this.length = lastCapture.length;
			this.value = lastCapture.value;
		}
		else
		{
			this.success = false;
			this.index = 0;
			this.length = 0;
			this.value = "";
		}
	}
}

export class Match
{
	public static empty: Match = new Match();

	public groups: Map<string, Group>;
	public captures: Capture[];
	public name: string;
	public success: boolean;
	public index: number;
	public length: number;
	public value: string;

	public constructor();
	public constructor(
		groups: Map<string, Group>,
		capture: Capture,
		regex: Regex,
		input: string,
		nextIndex: number
	);
	public constructor(
		groups: Map<string, Group> = new Map(),
		capture?: Capture,
		private readonly regex?: Regex,
		private readonly input?: string,
		private readonly nextIndex?: number
	)
	{
		const captures = capture !== undefined ? [capture] : [];
		this.groups = groups.set("0", new Group("0", captures));
		this.captures = captures;
		this.name = "0";
		if (capture !== undefined)
		{
			this.success = true;
			this.index = capture.index;
			this.length = capture.length;
			this.value = capture.value;
		}
		else
		{
			this.success = false;
			this.index = 0;
			this.length = 0;
			this.value = "";
		}
	}

	public group(name: number | string): Group | undefined
	{
		return this.groups.get(typeof name === "number" ? name.toString() : name);
	}

	public nextMatch(): Match
	{
		if (this === Match.empty)
		{
			return Match.empty;
		}
		else
		{
			return this.regex!.match(this.input!, this.nextIndex);
		}
	}
}
