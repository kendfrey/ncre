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

class Flags
{
	private stack: Array<Map<string, boolean>>;

	public constructor(setFlags: string)
	{
		this.stack = [];
		this.push();
		this.set(setFlags, "");
	}

	public has(flag: string): boolean
	{
		for (let i = this.stack.length - 1; i >= 0; i--)
		{
			const enabled = this.stack[i].get(flag);
			if (enabled !== undefined)
			{
				return enabled;
			}
		}
		return false;
	}

	public set(setFlags: string, clearFlags: string): void
	{
		for (const flag of setFlags.toLowerCase())
		{
			this.stack[this.stack.length - 1].set(flag, true);
		}
		for (const flag of clearFlags.toLowerCase())
		{
			this.stack[this.stack.length - 1].set(flag, false);
		}
	}

	public push(): void
	{
		this.stack.push(new Map());
	}

	public pop(): void
	{
		this.stack.pop();
	}
}

export interface ParseResult
{
	sequence: Expr.Sequence;
	groups: Map<string, CaptureGroup>;
}

type Predicate = (character: string) => boolean;

const predicate =
{
	literal(character: string): Predicate
	{
		return (c: string): boolean => c === character;
	},
	ignoreCase(basePredicate: Predicate): Predicate
	{
		return (c: string): boolean => basePredicate(c.toLowerCase()) || basePredicate(c.toUpperCase());
	},
	class(predicates: Predicate[]): Predicate
	{
		return (c: string): boolean => predicates.some(p => p(c));
	},
	negate(basePredicate: Predicate): Predicate
	{
		return (c: string): boolean => !basePredicate(c);
	},
	range(startCharCode: number, endCharCode: number): Predicate
	{
		return (c: string): boolean => c.charCodeAt(0) >= startCharCode && c.charCodeAt(0) <= endCharCode;
	},
	subtract(basePredicate: Predicate, subtractPredicate: Predicate): Predicate
	{
		return (c: string): boolean => basePredicate(c) && !subtractPredicate(c);
	},
};

const characterClass =
{
	digit: predicate.range("0".charCodeAt(0), "9".charCodeAt(0)),
	word: predicate.ignoreCase(predicate.class
	([
		predicate.range("0".charCodeAt(0), "9".charCodeAt(0)),
		predicate.range("a".charCodeAt(0), "a".charCodeAt(0)),
		predicate.literal("_"),
	])),
	whitespace: predicate.class
	([
		predicate.literal(" "),
		predicate.literal("\t"),
		predicate.literal("\r"),
		predicate.literal("\n"),
		predicate.literal("\f"),
		predicate.literal("\v"),
		predicate.literal("\u0085"),
	]),
	dot: predicate.negate(predicate.literal("\n")),
};

export class Parser
{
	private scanner: Scanner;
	private curGroupIndex = 1;
	private groups = new Map<string, CaptureGroup>();
	private flags: Flags;

	public constructor(regex: string, flags: string)
	{
		this.scanner = new Scanner(regex);
		this.flags = new Flags(flags);
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
		this.flags.push();
		const atoms = [];
		while (!this.scanner.peek(/\)|$/))
		{
			atoms.push(this.parseAtom());
		}
		this.flags.pop();
		return new Expr.Sequence(atoms);
	}

	private parseAtom(): Expr.Expression
	{
		this.scanner.unexpect(/[*+?)]/);

		let atom: Expr.Expression;
		if (this.scanner.consume("\\"))
		{
			// Parse escape sequence
			atom = this.parseEscape();
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
		else if (this.scanner.consume("(?"))
		{
			// Parse flag modifiers
			this.scanner.expect(/[A-Za-z]+|(?=-)/, "flags specifier");
			const setFlags = this.scanner.token;
			this.checkFlags(setFlags);
			let clearFlags = "";
			if (this.scanner.consume("-"))
			{
				this.scanner.expect(/[A-Za-z]*/, "flags specifier");
				clearFlags = this.scanner.token;
				this.checkFlags(clearFlags);
			}
			if (this.scanner.consume(":"))
			{
				// Parse scoped flags - (?flags:regex)
				this.flags.push();
				this.flags.set(setFlags, clearFlags);
				atom = this.parseSequence();
				this.scanner.expect(")");
				this.flags.pop();
			}
			else
			{
				// Parse normal flags modifier - (?flags)
				this.scanner.expect(")");
				this.flags.set(setFlags, clearFlags);
				return this.parseAtom(); // This just short-circuits to parsing the next atom.
			}
		}
		else if (this.scanner.consume("("))
		{
			// Parse capturing group
			const group = this.getGroup(this.curGroupIndex.toString());
			this.curGroupIndex++;
			atom = new Expr.Group(this.parseSequence(), group);
			this.scanner.expect(")");
		}
		else if (this.scanner.consume("["))
		{
			// Parse character class
			atom = new Expr.Character(this.parseClass());
			this.scanner.expect("]");
		}
		else if (this.scanner.consume("."))
		{
			// Parse dot (any character)
			atom = new Expr.Character(this.flags.has("s") ? (): boolean => true : characterClass.dot);
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
		let literalPredicate = predicate.literal(this.scanner.token);
		if (this.flags.has("i"))
		{
			literalPredicate = predicate.ignoreCase(literalPredicate);
		}
		return new Expr.Character(literalPredicate);
	}

	private parseEscape(): Expr.Expression
	{
		if (this.scanner.consume("d"))
		{
			return new Expr.Character(characterClass.digit);
		}
		else if (this.scanner.consume("D"))
		{
			return new Expr.Character(predicate.negate(characterClass.digit));
		}
		else if (this.scanner.consume("w"))
		{
			return new Expr.Character(characterClass.word);
		}
		else if (this.scanner.consume("W"))
		{
			return new Expr.Character(predicate.negate(characterClass.word));
		}
		else if (this.scanner.consume("s"))
		{
			return new Expr.Character(characterClass.whitespace);
		}
		else if (this.scanner.consume("S"))
		{
			return new Expr.Character(predicate.negate(characterClass.whitespace));
		}
		else if (this.scanner.consume("t"))
		{
			return new Expr.Character(predicate.literal("\t"));
		}
		else if (this.scanner.consume("r"))
		{
			return new Expr.Character(predicate.literal("\r"));
		}
		else if (this.scanner.consume("n"))
		{
			return new Expr.Character(predicate.literal("\n"));
		}
		else if (this.scanner.consume("a"))
		{
			return new Expr.Character(predicate.literal("\x07"));
		}
		else if (this.scanner.consume("b"))
		{
			return new Expr.Character(predicate.literal("\b"));
		}
		else if (this.scanner.consume("e"))
		{
			return new Expr.Character(predicate.literal("\x1B"));
		}
		else if (this.scanner.consume("f"))
		{
			return new Expr.Character(predicate.literal("\f"));
		}
		else if (this.scanner.consume("v"))
		{
			return new Expr.Character(predicate.literal("\v"));
		}
		else
		{
			this.scanner.expect(/[[\\^$.|?*+(){}]/, "escape sequence");
			return new Expr.Character(predicate.literal(this.scanner.token));
		}
	}

	private parseClass(): Predicate
	{
		const negate = this.scanner.consume("^");
		const predicates = [];
		let subtractedClass;
		while (true)
		{
			if (this.scanner.consume("-["))
			{
				subtractedClass = this.parseClass();
				this.scanner.expect("]");
				break;
			}
			else if (this.scanner.peek(/[^\]]/))
			{
				const startIndex = this.scanner.index;
				const element = this.parseClassElement();
				if (typeof element === "string")
				{
					if (this.scanner.consume(/-(?!])/))
					{
						// Parse character range
						const endIndex = this.scanner.index;
						const endElement = this.parseClassElement();
						if (typeof endElement !== "string")
						{
							throw new SyntaxError(`Unexpected class expression in a character range at position ${endIndex}.`);
						}
						const start = element.charCodeAt(0);
						const end = endElement.charCodeAt(0);
						if (start > end)
						{
							throw new SyntaxError(`Range expression in reverse order at position ${startIndex}.`);
						}
						predicates.push(predicate.range(start, end));
					}
					else
					{
						// Handle single character
						predicates.push(predicate.literal(element));
					}
				}
				else
				{
					// Handle character class, such as \d
					predicates.push(element);
				}
			}
			else
			{
				break;
			}
		}
		let classPredicate = predicate.class(predicates);
		if (this.flags.has("i"))
		{
			classPredicate = predicate.ignoreCase(classPredicate);
		}
		if (negate)
		{
			classPredicate = predicate.negate(classPredicate);
		}
		if (subtractedClass !== undefined)
		{
			classPredicate = predicate.subtract(classPredicate, subtractedClass);
		}
		return classPredicate;
	}

	private parseClassElement(): string | Predicate
	{
		// Parse a single element of a class, such as "a", "\]", or "\d"
		if (this.scanner.consume("\\"))
		{
			return this.parseClassEscape();
		}
		else
		{
			if (!this.scanner.consume(/[^]/))
			{
				throw new Error(`Internal error NO_CHAR at position ${this.scanner.index}.`);
			}
			return this.scanner.token;
		}
	}

	private parseClassEscape(): string | Predicate
	{
		if (this.scanner.consume("d"))
		{
			return characterClass.digit;
		}
		else if (this.scanner.consume("D"))
		{
			return predicate.negate(characterClass.digit);
		}
		else if (this.scanner.consume("w"))
		{
			return characterClass.word;
		}
		else if (this.scanner.consume("W"))
		{
			return predicate.negate(characterClass.word);
		}
		else if (this.scanner.consume("s"))
		{
			return characterClass.whitespace;
		}
		else if (this.scanner.consume("S"))
		{
			return predicate.negate(characterClass.whitespace);
		}
		else if (this.scanner.consume("t"))
		{
			return "\t";
		}
		else if (this.scanner.consume("r"))
		{
			return "\r";
		}
		else if (this.scanner.consume("n"))
		{
			return "\n";
		}
		else if (this.scanner.consume("a"))
		{
			return "\x07";
		}
		else if (this.scanner.consume("b"))
		{
			return "\b";
		}
		else if (this.scanner.consume("e"))
		{
			return "\x1B";
		}
		else if (this.scanner.consume("f"))
		{
			return "\f";
		}
		else if (this.scanner.consume("v"))
		{
			return "\v";
		}
		else
		{
			this.scanner.expect(/[\^\-\]\\]/, "escape sequence");
			return this.scanner.token;
		}
	}

	private checkFlags(flags: string): void
	{
		const invalidFlag = Parser.findInvalidFlag(flags);
		if (invalidFlag !== undefined)
		{
			const flagPosition = this.scanner.index - flags.length + flags.indexOf(invalidFlag);
			throw new SyntaxError(`Invalid flag "${invalidFlag}" at position ${flagPosition}.`);
		}
	}

	public static findInvalidFlag(flags: string): string | undefined
	{
		const match = flags.match(/[^is]/i);
		if (match !== null)
		{
			return match[0];
		}
	}
}
