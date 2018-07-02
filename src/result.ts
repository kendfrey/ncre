import { Regex } from "./ncre";
import { Scanner } from "./scanner";

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
	private readonly collapsedGroupList: string[] = [];

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

			// Sort the group list the way .NET does it, for future reference.
			const numberedGroups = [...this.groups.keys()].filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
			const namedGroups = [...this.groups.keys()].filter(k => !/^\d+$/.test(k));
			for (let i = 0; numberedGroups.length > 0 && namedGroups.length > 0; i++)
			{
				if (numberedGroups[0] === i.toString())
				{
					this.collapsedGroupList.push(numberedGroups.shift()!);
				}
				else
				{
					this.collapsedGroupList.push(namedGroups.shift()!);
				}
			}
			this.collapsedGroupList.push(...numberedGroups, ...namedGroups);
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
		if (!this.success)
		{
			return Match.empty;
		}
		else
		{
			return this.regex!.match(this.input!, this.nextIndex);
		}
	}

	public result(replacement: string): string
	{
		if (!this.success)
		{
			throw new Error("Cannot perform a replacement with a failed match.");
		}

		const scanner = new Scanner(replacement);

		// Read literal text
		scanner.expect(/[^$]*/);
		let result = scanner.token;

		// Find escape sequences
		while (scanner.consume("$"))
		{
			if (scanner.consume("$"))
			{
				// Escaped $
				result += "$";
			}
			else if ((scanner.peek(/(\d+)/) || scanner.peek(/\{([_A-Za-z]\w*|\d+)\}/))
				&& this.groups.has(scanner.match![1]!))
			{
				// Backreference
				result += this.groups.get(scanner.match![1]!)!.value;
				if (!scanner.consume(scanner.token))
				{
					throw new Error(`Internal error RECONSUME_FAILED at position ${scanner.index}.`);
				}
			}
			else if (scanner.consume("&"))
			{
				// Entire match
				result += this.value;
			}
			else if (scanner.consume("+"))
			{
				result += this.groups.get(this.collapsedGroupList[this.collapsedGroupList.length - 1])!.value;
			}
			else if (scanner.consume("_"))
			{
				// Entire input string
				result += this.input!;
			}
			else if (scanner.consume("`"))
			{
				// Preceding input string
				result += this.input!.substr(0, this.index);
			}
			else if (scanner.consume("'"))
			{
				// Following input string
				result += this.input!.substr(this.index + this.length);
			}
			else
			{
				// Unescaped literal $
				result += "$";
			}

			// Read literal text
			scanner.expect(/[^$]*/);
			result += scanner.token;
		}
		return result;
	}
}
