import * as Expr from "./expression";
import { CaptureGroup, State } from "./state";

class Scanner
{
	public index = 0;
	public token: string;
	public match: Array<string | undefined> | undefined;

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
				this.match = match;
				return true;
			}
		}
		else
		{
			if (this.str.startsWith(pattern, this.index))
			{
				this.token = pattern;
				this.match = undefined;
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
	expression: Expr.Expression;
	groups: Map<string, CaptureGroup>;
}

type Predicate = (character: string) => boolean;

const predicate =
{
	literal(character: string): Predicate
	{
		return (c: string): boolean => c === character;
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
	word: predicate.class
	([
		predicate.range("0".charCodeAt(0), "9".charCodeAt(0)),
		predicate.range("A".charCodeAt(0), "Z".charCodeAt(0)),
		predicate.range("a".charCodeAt(0), "z".charCodeAt(0)),
		predicate.literal("_"),
	]),
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
	private postParseActions: Array<() => void> = [];

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
		const expression = this.parseRegex();
		this.scanner.unexpect(/[^]/);
		this.postParseActions.forEach(f => f());
		return { expression, groups: this.groups };
	}

	private parseRegex(): Expr.Expression
	{
		this.flags.push();

		let expression: Expr.Expression = this.parseSequence();
		if (this.scanner.consume("|"))
		{
			expression = new Expr.Alternation(expression, this.parseRegex());
		}

		this.flags.pop();
		return expression;
	}

	private parseSequence(): Expr.Sequence
	{
		const atoms = [];
		while (this.scanner.peek(/[^)|]/))
		{
			const atom = this.parseAtom();
			if (atom !== undefined)
			{
				atoms.push(atom);
			}
		}
		return new Expr.Sequence(atoms);
	}

	private parseAtom(): Expr.Expression | undefined
	{
		this.scanner.unexpect(/[*+?)]|{(\d+)(,(\d+)?)?}/);

		let atom: Expr.Expression;
		if (this.scanner.consume("\\"))
		{
			// Parse escape sequence
			atom = this.parseEscape();
		}
		else if (this.scanner.consume("(?:"))
		{
			// Parse non-capturing group
			atom = this.parseRegex();
			this.scanner.expect(")");
		}
		else if (this.scanner.consume(/\(\?([=!])/))
		{
			// Parse lookahead
			const negate = this.scanner.match![1] === "!";
			const expression = this.parseRegex();
			atom = new Expr.Anchor(undefined, expression, (s: State, l: boolean, r: boolean): boolean => r !== negate);
			this.scanner.expect(")");
		}
		else if (this.scanner.consume(/\(\?<([=!])/))
		{
			// Parse lookbehind
			const negate = this.scanner.match![1] === "!";
			const expression = this.parseRegex();
			expression.invert();
			atom = new Expr.Anchor(expression, undefined, (s: State, l: boolean, r: boolean): boolean => l !== negate);
			this.scanner.expect(")");
		}
		else if (this.scanner.consume(/\(\?([<'])/))
		{
			// Parse named capturing group
			const endDelim = this.scanner.match![1] === "<" ? ">" : "'";
			const nameIndex = this.scanner.index;
			this.scanner.expect(/[_A-Za-z]\w*|\d+/, "group name or index");
			const name = this.scanner.token;
			if (name.startsWith("0"))
			{
				throw new SyntaxError(
					"Group index cannot begin with 0. " +
					`Invalid group name at position ${nameIndex}.`);
			}
			this.scanner.expect(endDelim);
			atom = new Expr.Group(this.parseRegex(), this.getGroup(name));
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
				atom = this.parseRegex();
				this.scanner.expect(")");
				this.flags.pop();
			}
			else
			{
				// Parse normal flags modifier - (?flags)
				this.scanner.expect(")");
				this.flags.set(setFlags, clearFlags);
				return undefined;
			}
		}
		else if (this.scanner.consume("("))
		{
			// Parse capturing group
			const group = this.getGroup(this.curGroupIndex.toString());
			this.curGroupIndex++;
			atom = new Expr.Group(this.parseRegex(), group);
			this.scanner.expect(")");
		}
		else if (this.scanner.consume("["))
		{
			// Parse character class
			atom = new Expr.Character(this.parseClass(), this.flags.has("i"));
			this.scanner.expect("]");
		}
		else if (this.scanner.consume("."))
		{
			// Parse dot (any character)
			atom = new Expr.Character(this.flags.has("s") ? (): boolean => true : characterClass.dot);
		}
		else if (this.scanner.consume("^"))
		{
			// Parse a string start anchor
			// ^ is equivalent to (?<![^]) or (?<!.) in multi-line mode.
			const anchorPredicate = this.flags.has("m") ? characterClass.dot : (): boolean => true;
			atom = new Expr.Anchor(
				new Expr.Character(anchorPredicate),
				undefined,
				(s: State, l: boolean, r: boolean): boolean => !l
			);
		}
		else if (this.scanner.consume("$"))
		{
			// Parse a string end anchor
			// $ is equivalent to (?!.|\n[^]) or (?!.) in multi-line mode.
			let anchor;
			if (this.flags.has("m"))
			{
				anchor = new Expr.Character(characterClass.dot);
			}
			else
			{
				anchor = new Expr.Alternation(
					new Expr.Character(characterClass.dot),
					new Expr.Sequence([new Expr.Character(predicate.literal("\n")), new Expr.Character((): boolean => true)])
				);
			}
			atom = new Expr.Anchor(
				undefined,
				anchor,
				(s: State, l: boolean, r: boolean): boolean => !r
			);
		}
		else
		{
			// Parse literal character
			atom = this.parseLiteralCharacter();
		}

		// Parse repetition modifiers
		if (this.scanner.consume(/[*+?]|{(\d+)(,(\d+)?)?}/))
		{
			const repetition = this.scanner.token;
			const match = this.scanner.match!;
			// Parse lazy modifier
			const lazy = this.scanner.consume("?");
			let min;
			let max;
			switch (repetition)
			{
				case "*":
					min = 0;
					max = Infinity;
					break;
				case "+":
					min = 1;
					max = Infinity;
					break;
				case "?":
					min = 0;
					max = 1;
					break;
				default:
					// The {min,max} specifier
					min = parseInt(match[1]!);
					max = min;
					if (match[2] !== undefined)
					{
						if (match[3] !== undefined)
						{
							max = parseInt(match[3]!);
							if (max < min)
							{
								throw new SyntaxError(
									"Maximum must not be less than minimum. " +
									`Invalid repetition count at ${this.scanner.index - this.scanner.token.length}.`);
							}
						}
						else
						{
							max = Infinity;
						}
					}
					break;
			}
			atom = new Expr.Repetition(atom, min, max, lazy);
		}

		return atom;
	}

	private parseLiteralCharacter(): Expr.Character
	{
		if (!this.scanner.consume(/[^]/))
		{
			throw new Error(`Internal error NO_CHAR at position ${this.scanner.index}.`);
		}
		return new Expr.Character(predicate.literal(this.scanner.token), this.flags.has("i"));
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
		else if (this.scanner.consume("c"))
		{
			this.scanner.expect(/[A-Za-z]/, "control character letter");
			return new Expr.Character(
				predicate.literal(String.fromCharCode(this.scanner.token.toUpperCase().charCodeAt(0) - 64)),
				this.flags.has("i")
			);
		}
		else if (this.scanner.consume("x"))
		{
			this.scanner.expect(/[0-9A-Fa-f]{2}/, "2-letter hex code");
			return new Expr.Character(
				predicate.literal(String.fromCharCode(parseInt(this.scanner.token, 16))),
				this.flags.has("i")
			);
		}
		else if (this.scanner.consume("u"))
		{
			this.scanner.expect(/[0-9A-Fa-f]{4}/, "4-letter hex code");
			return new Expr.Character(
				predicate.literal(String.fromCharCode(parseInt(this.scanner.token, 16))),
				this.flags.has("i")
			);
		}
		else if (this.scanner.consume("k"))
		{
			return this.parseNamedBackReference();
		}
		else if (this.scanner.consume(/0[0-7]{1,2}/))
		{
			// Parse octal codes beginning with 0.
			return new Expr.Character(predicate.literal(String.fromCharCode(parseInt(this.scanner.token, 8))));
		}
		else if (this.scanner.consume("0"))
		{
			return new Expr.Character(predicate.literal("\0"));
		}
		else if (this.scanner.consume(/[1-9]\d*/))
		{
			return this.parseBackReferenceOrOctalCode();
		}
		else
		{
			this.scanner.expect(/[[\\^$.|?*+(){}]/, "escape sequence");
			return new Expr.Character(predicate.literal(this.scanner.token));
		}
	}

	private parseNamedBackReference(): Expr.Reference
	{
		this.scanner.expect(/[<']/, "< or '");
		const endDelim = this.scanner.token === "<" ? ">" : "'";
		const nameIndex = this.scanner.index;
		this.scanner.expect(/[_A-Za-z]\w*|\d+/, "group name or index");
		const name = this.scanner.token;
		if (name.startsWith("0"))
		{
			throw new SyntaxError(
				"Group index cannot begin with 0. " +
				`Invalid group name at position ${nameIndex}.`);
		}
		this.scanner.expect(endDelim);
		const reference = new Expr.Reference(this.flags.has("i"));
		this.postParseActions.push(() =>
		{
			const group = this.groups.get(name);
			if (group !== undefined)
			{
				reference.group = group;
			}
			else
			{
				throw new SyntaxError(`Invalid group name ${name} at position ${nameIndex}.`);
			}
		});
		return reference;
	}

	private parseBackReferenceOrOctalCode(): Expr.Proxy
	{
		const num = this.scanner.token;
		const numIndex = this.scanner.index;
		const proxy = new Expr.Proxy();
		const ignoreCase = this.flags.has("i");
		this.postParseActions.push(() =>
		{
			const group = this.groups.get(num);
			if (group !== undefined)
			{
				// It's a back reference.
				proxy.setExpression(new Expr.Reference(ignoreCase, group));
			}
			else
			{
				// It's an octal code, possibly followed by some literal digits.
				const octalMatch = num.match(/^([0-7]{2,3})(.*)/);
				if (octalMatch === null)
				{
					// It's not a valid octal code or a group number.
					throw new SyntaxError(`Invalid group number ${num} at position ${numIndex}.`);
				}

				// Parse a sequence containing an octal code first, then literals for the rest of the digits.
				const atoms = [];
				atoms.push(new Expr.Character(
					predicate.literal(String.fromCharCode(parseInt(octalMatch[1], 8) % 0x100)),
					this.flags.has("i")
				));
				for (const digit of octalMatch[2])
				{
					atoms.push(new Expr.Character(predicate.literal(digit)));
				}
				proxy.setExpression(new Expr.Sequence(atoms));
			}
		});
		return proxy;
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
		else if (this.scanner.consume("c"))
		{
			this.scanner.expect(/[A-Za-z]/, "control character letter");
			return String.fromCharCode(this.scanner.token.toUpperCase().charCodeAt(0) - 64);
		}
		else if (this.scanner.consume("x"))
		{
			this.scanner.expect(/[0-9A-Fa-f]{2}/, "2-letter hex code");
			return String.fromCharCode(parseInt(this.scanner.token, 16));
		}
		else if (this.scanner.consume("u"))
		{
			this.scanner.expect(/[0-9A-Fa-f]{4}/, "4-letter hex code");
			return String.fromCharCode(parseInt(this.scanner.token, 16));
		}
		else if (this.scanner.consume(/[0-7]{2,3}/))
		{
			return String.fromCharCode(parseInt(this.scanner.token, 8) % 0x100);
		}
		else if (this.scanner.consume("0"))
		{
			return "\0";
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
		const match = flags.match(/[^ims]/i);
		if (match !== null)
		{
			return match[0];
		}
	}
}
