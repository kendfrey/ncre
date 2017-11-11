import * as Expr from "./expression";

class Scanner
{
	public index = 0;

	public constructor(private readonly str: string)
	{

	}

	public peek(pattern: RegExp | string): string | undefined
	{
		if (pattern instanceof RegExp)
		{
			const regex = new RegExp(pattern, "y");
			regex.lastIndex = this.index;
			const match = this.str.match(regex);
			if (match !== null)
			{
				return match[0];
			}
		}
		else
		{
			if (this.str.startsWith(pattern, this.index))
			{
				return pattern;
			}
		}
	}

	public consume(pattern: RegExp | string): string | undefined
	{
		const result = this.peek(pattern);
		if (result !== undefined)
		{
			this.index += result.length;
		}
		return result;
	}

	public get eos(): boolean
	{
		return this.index >= this.str.length;
	}
}

export class Parser
{
	private scanner: Scanner;

	public constructor(str: string)
	{
		this.scanner = new Scanner(str);
	}

	public parseSeq(): Expr.Sequence
	{
		const atoms = [];
		while (this.scanner.peek(/\)|$/) === undefined)
		{
			atoms.push(this.parseAtom());
		}
		return new Expr.Sequence(atoms);
	}

	private parseAtom(): Expr.Expression
	{
		const invalid = this.scanner.peek(/[*+?)]/);
		if (invalid !== undefined)
		{
			throw new SyntaxError(`Unexpected "${invalid}" at position ${this.scanner.index}.`);
		}

		let atom: Expr.Expression;
		if (this.scanner.consume("\\") !== undefined)
		{
			atom = this.parseChar();
		}
		else if (this.scanner.consume("(?:") !== undefined)
		{
			atom = this.parseSeq();
			if (this.scanner.consume(")") === undefined)
			{
				throw new SyntaxError(`Expected ")" at position ${this.scanner.index}.`);
			}
		}
		else
		{
			atom = this.parseChar();
		}

		const repetition = this.scanner.consume(/[*+?]/);
		if (repetition !== undefined)
		{
			const lazy = Boolean(this.scanner.consume("?"));
			switch (repetition)
			{
				case "*":
					atom = new Expr.Repetition(atom, 0, Infinity, lazy);
					break;
				case "+":
					atom = new Expr.Repetition(atom, 1, Infinity, lazy);
					break;
				case "?":
					atom = new Expr.Repetition(atom, 0, 1, lazy);
					break;
				default:
					// Just return the atom.
					break;
			}
		}

		return atom;
	}

	private parseChar(): Expr.Character
	{
		const char = this.scanner.consume(/[^]/);
		if (char === undefined)
		{
			throw new Error(`Internal error NO_CHAR at position ${this.scanner.index}.`);
		}
		return new Expr.Character(char);
	}
}
