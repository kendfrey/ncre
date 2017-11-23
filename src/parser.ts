import * as Expr from "./expression";
import { CaptureGroup } from "./state";

class Scanner
{
	public index = 0;
	public token: string;

	public constructor(private readonly str: string)
	{

	}

	public peek(pattern: RegExp | string): boolean
	{
		if (pattern instanceof RegExp)
		{
			const regex = new RegExp(pattern, "y");
			regex.lastIndex = this.index;
			const match = this.str.match(regex);
			if (match !== null)
			{
				this.token = match[0];
				return true;
			}
		}
		else
		{
			if (this.str.startsWith(pattern, this.index))
			{
				this.token = pattern;
				return true;
			}
		}
		return false;
	}

	public consume(pattern: RegExp | string): boolean
	{
		if (this.peek(pattern))
		{
			this.index += this.token.length;
			return true;
		}
		return false;
	}

	public expect(pattern: RegExp | string, description?: string): void
	{
		if (!this.consume(pattern))
		{
			let expected;
			if (description !== undefined)
			{
				expected = description;
			}
			else if (pattern instanceof RegExp)
			{
				expected = pattern.toString();
			}
			else
			{
				expected = `"${pattern}"`;
			}
			throw new SyntaxError(`Expected ${expected} at position ${this.index}.`);
		}
	}

	public unexpect(pattern: RegExp | string, description?: string): void
	{
		if (this.peek(pattern))
		{
			throw new SyntaxError(`Unexpected "${this.token}" at position ${this.index}.`);
		}
	}
}

export interface ParseResult
{
	sequence: Expr.Sequence;
	groups: Map<string, CaptureGroup>;
}

export class Parser
{
	private scanner: Scanner;
	private curGroupIndex = 1;
	private groups = new Map<string, CaptureGroup>();

	public constructor(str: string)
	{
		this.scanner = new Scanner(str);
	}

	private getGroup(name: string): CaptureGroup
	{
		let group = this.groups.get(name);
		if (group === undefined)
		{
			group = new CaptureGroup(name);
			this.groups.set(name, group);
		}
		return group;
	}

	public parse(): ParseResult
	{
		const sequence = this.parseSequence();
		this.scanner.unexpect(/[^]/);
		return { sequence, groups: this.groups };
	}

	private parseSequence(): Expr.Sequence
	{
		const atoms = [];
		while (!this.scanner.peek(/\)|$/))
		{
			atoms.push(this.parseAtom());
		}
		return new Expr.Sequence(atoms);
	}

	private parseAtom(): Expr.Expression
	{
		this.scanner.unexpect(/[*+?)]/);

		let atom: Expr.Expression;
		if (this.scanner.consume("\\"))
		{
			// Parse escape sequence
			atom = this.parseLiteralCharacter();
		}
		else if (this.scanner.consume("(?:"))
		{
			// Parse non-capturing group
			atom = this.parseSequence();
			this.scanner.expect(")");
		}
		else if (this.scanner.consume(/\(\?[<']/))
		{
			// Parse named capturing group
			const endDelim = this.scanner.token.endsWith("<") ? ">" : "'";
			this.scanner.expect(/[_A-Za-z]\w*|\d+/, "group name or index");
			const name = this.scanner.token;
			if (name.startsWith("0"))
			{
				throw new SyntaxError(`Group index cannot begin with 0. Invalid group name at position ${this.scanner.index}.`);
			}
			this.scanner.expect(endDelim);
			atom = new Expr.Group(this.parseSequence(), this.getGroup(name));
			this.scanner.expect(")");
		}
		else if (this.scanner.consume("("))
		{
			// Parse capturing group
			const group = this.getGroup(this.curGroupIndex.toString());
			this.curGroupIndex++;
			atom = new Expr.Group(this.parseSequence(), group);
			this.scanner.expect(")");
		}
		else
		{
			// Parse literal character
			atom = this.parseLiteralCharacter();
		}

		// Parse repetition modifiers
		if (this.scanner.consume(/[*+?]/))
		{
			const repetition = this.scanner.token;
			// Parse lazy modifier
			const lazy = this.scanner.consume("?");
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

	private parseLiteralCharacter(): Expr.Character
	{
		if (!this.scanner.consume(/[^]/))
		{
			throw new Error(`Internal error NO_CHAR at position ${this.scanner.index}.`);
		}
		return new Expr.Character(literal(this.scanner.token, false));

		function literal(character: string, caseInsensitive: boolean): (character: string) => boolean
		{
			if (caseInsensitive)
			{
				return (c: string): boolean => c.toLowerCase() === character.toLowerCase();
			}
			else
			{
				return (c: string): boolean => c === character;
			}
		}
	}
}
