export class Capture
{
	public index: number;
	public length: number;
	public value: string;
}

export class Group extends Capture
{
	public captures: Capture[];
	public name: string;
	public success: boolean;
}

export class Match extends Group
{
	public groups: Group[];
}
