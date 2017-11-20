export class State
{
	public index: number;
	public groups: Map<CaptureGroup, CaptureValue[]>;

	public constructor(public readonly str: string, groups: CaptureGroup[])
	{
		this.groups = new Map(groups.map(g => [g, []] as [CaptureGroup, CaptureValue[]]));
	}
}

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
