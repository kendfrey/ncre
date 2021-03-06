"use strict";

const ncre = require("../dist/ncre.js");
const edge = require("edge-js");
const testClass = { assemblyFile: require("path").join(__dirname, "test.dll"), typeName: "Ncre.Test" };
const dotnet =
{
	parse: edge.func({ ...testClass, methodName: "Parse" }),
	match: edge.func({ ...testClass, methodName: "Match" }),
	matches: edge.func({ ...testClass, methodName: "Matches" }),
	replace: edge.func({ ...testClass, methodName: "Replace" }),
};
// Pre-load the CLR to avoid affecting first test performance.
dotnet.parse({ regex: "" }, true);

const assert = require("assert");
suite("regex engine", () =>
{
	suite("basics", () =>
	{
		testMatches("literal text", "abb", "ababbb");
		testNoMatches("failed match", "a", "b");
		testMatches("dot - .", ".*", "abc\r\n");
		testMatches("alternation - |", "a*|b", "aabba");
	});

	suite("escape sequences", () =>
	{
		testMatches("literal - \\", "a\\+", "aaa+");
		testNoParse("invalid sequence", "\\q");
		testMatches("digit - \\d", "\\d+", "abc1234567890def");
		testMatches("non-digit - \\D", "\\D+", "abc1234567890def");
		testMatches("word character - \\w", "\\w+", "(a_123)");
		testMatches("non-word character - \\W", "\\W+", "(a_123)");
		testMatches("whitespace - \\s", "\\s+", "a\r \nb");
		testMatches("non-whitespace - \\S", "\\S+", "a\r \nb");
		testMatches("tab - \\t", "\\t+", "\ta");
		testMatches("carriage return - \\r", "\\r+", "\ra");
		testMatches("newline - \\n", "\\n+", "\na");
		testMatches("alert - \\a", "\\a+", "\x07a");
		testMatches("escape - \\e", "\\e+", "\x1Ba");
		testMatches("form feed - \\f", "\\f+", "\fa");
		testMatches("vertical tab - \\v", "\\v+", "\va");
		testMatches("null character - \\0", "\\0+", "\0a");
		testMatches("control character - \\c", "\\c@+\\cj+", "\0\na");
		testMatches("hex - \\x", "\\x61\\x5F", "a_a");
		testMatches("unicode hex - \\u", "\\u0061\\u2081", "a₁a");
		testMatches("octal - \\nnn", "\\141\\060", "a0a");
		testMatches("octal overflow - \\nnn", "\\141\\460", "a0a");

		suite("back references", () =>
		{
			testMatches("indexed - \\n", "(a)(b)c\\2\\1", "abcba");
			testMatches("named - \\k<>", "(a)(?<X>b)c\\k<X>\\k<1>", "abcba");
			testMatches("named - \\k''", "(a)(?'X'b)c\\k'X'\\k'1'", "abcba");
			testNoParse("nonexistent group", "(a)\\2");
			testNoParse("nonexistent named group", "(a)\\k<X>");
			testNoMatches("uncaptured group", "(a)?\\1", "bb");
			testMatches("nested", "(a\\1?)", "aaaaa");
			testMatches("forward", "(?:\\1?(a))+", "aaaaa");
			testNoMatches("case sensitivity", "(a)\\1", "aA");
			testMatches("case insensitivity", "(a)\\1", "aA", { flags: "i" });
		});
	});

	suite("repetition", () =>
	{
		testMatches("zero or one - ?", "ab?c?a?", "aba");
		testMatches("zero or more - *", "b*a*", "aabbb");
		testMatches("one or more - +", "b+", "aabbb");
		testNoParse("invalid character - ?", "?a");
		testNoParse("invalid character - *", "*a");
		testNoParse("invalid character - +", "+a");

		suite("limited", () =>
		{
			testMatches("exact count - {n}", "a{2}", "abaaaaa");
			testMatches("minimum count - {n,}", "a{2,}", "abaaaaa");
			testMatches("range count - {n,m}", "a{2,3}", "abaaaaa");
			testMatches("literal if incorrect format", "a{-2,3}", "aaa{-2,3}");
			testNoParse("invalid position", "a*{2,3}");
		});

		suite("lazy", () =>
		{
			testMatches("lazy zero or one - ??", "ab??", "ab");
			testMatches("lazy zero or more - *?", "a*?b*?", "aabbb");
			testMatches("lazy one or more - +?", "a+?b+?", "aabbb");
			testMatches("lazy range - {n,m}?", "a{2,3}?", "abaaaaa");
		});
	});

	suite("groups", () =>
	{
		testMatches("non-capturing - (?:)", "a(?:b(?:c)?)*", "abbccb");
		testNoParse("mismatched parentheses - (", "(a");
		testNoParse("mismatched parentheses - )", ")a");
		testMatches("alternation - |", "(a*|b)*", "aabba");
		testNoMatches("atomic - (?>)", "(?>ab?)b", "ab");
		testMatches("comment - (?#)", "a(?# This is a comment. )b", "ab")

		suite("capturing", () =>
		{
			testMatches("captured - ()", "(a(b)*)*(b)", "aabbbaab");
			testMatches("named - (?<>)", "(?<A>a)+(b)", "aab");
			testMatches("named - (?'')", "(?'A'a)+(b)", "aab");
			testMatches("numbered", "(?<3>a)+(b)", "aab");
			testMatches("duplicate names", "(?<A>a)+(?<A>b)", "aab");
			testMatches("duplicate numbers", "(a)+(?<1>b)", "aab");
			testMatches("case sensitive names", "(?<A>a)+(?<a>b)", "aab");
			testNoParse("invalid names", "(?<1a>)");
			testParse("underscored names", "(?<_1a>)");
			testNoParse("invalid zero", "(?<0>)");
			testNoParse("invalid leading zero", "(?<01>)");
			testParse("valid leading zero for existing group", "(?<01>)()");

			suite("balancing", () =>
			{
				testMatches("subtraction - (?<-X>)", "(?<A>a)+(?<-A>b)+", "aaab");
				testMatches("balancing - (?<Y-X>)", "(?<A>a)+.+?(?<B-A>b)+", "aaaxyzbb");
				testNoParse("nonexistent group", "(?<-A>b)", "b");
				testNoMatches("uncaptured group", "(?<A>a)?(?<-A>b)", "b");
				testNoParse("invalid zero", "(?<0-1>)()");
				testNoParse("invalid leading zero", "(?<02-1>)()");
				testParse("valid leading zero for existing group (capture group)", "(?<01-1>)()");
				testParse("valid leading zero for existing group (subtracted group)", "(?<1-01>)");
			});
		});

		suite("conditional", () =>
		{
			testMatches("lookahead - (?(?=if)then|else)", "\\b(?(?=a)a+|\\d+)", "aaa 123 b123");
			testMatches("negative lookahead - (?(?!if)then|else)", "\\b(?(?!\\d)a+|\\d+)", "aaa 123 b123");
			testMatches("lookbehind - (?(?<=if)then|else)", "\\b(?(?<=-)\\d+|\\d)", "123 -123");
			testMatches("negative lookbehind - (?(?<!if)then|else)", "\\b(?(?<!-)\\d+|\\d)", "123 -123");
			testMatches("implicit lookahead - (?(if)then|else)", "\\b(?(a+)a+|\\d+)", "aaa 123 b123");
			testMatches("implicit lookahead disambiguated from group name", "\\b(?(a)a+|\\d+)", "aaa 123 b123");
			testNoParse("group index cannot be an implicit lookahead", "(?(1)a)", "aaa 123 b123");
			testMatches("implicit lookahead matches regex direction", "(?(a)a|b)", "a", { rightToLeft: true });
			testMatches("capture - (?(if)then|else)", "\\b(?<a>a)?(?(a)a*|\\w+)", "aaabbb bbbaaa");
		});
	});

	suite("character classes", () =>
	{
		testMatches("inclusive - []", "[a-z0]+", "123abc0123");
		testMatches("exclusive - [^]", "[^a-z0]+", "123abc0123");
		testNoParse("mismatched brackets - [", "[");
		testParse("mismatched brackets - ]", "]");
		testMatches("literal hyphens - -", "[a-]+", "a-z");
		testMatches("subtraction - -[]", "[a-z-[ad]]+", "abcdef");

		suite("escape sequences", () =>
		{
			testMatches("literal - \\", "[[\\]a]+", "ab][[]ab");
			testNoParse("invalid sequence", "[\\q]");
			testMatches("digit - \\d", "[\\d]+", "abc1234567890def");
			testMatches("non-digit - \\D", "[\\D]+", "abc1234567890def");
			testMatches("word character - \\w", "[\\w]+", "(a_123)");
			testMatches("non-word character - \\W", "[\\W]+", "(a_123)");
			testMatches("whitespace - \\s", "[\\s]+", "a\r \nb");
			testMatches("non-whitespace - \\S", "[\\S]+", "a\r \nb");
			testMatches("tab - \\t", "[\\t]+", "\ta");
			testMatches("carriage return - \\r", "[\\r]+", "\ra");
			testMatches("newline - \\n", "[\\n]+", "\na");
			testMatches("alert - \\a", "[\\a]+", "\x07a");
			testMatches("backspace - \\b", "[\\b]+", "\ba");
			testMatches("escape - \\e", "[\\e]+", "\x1Ba");
			testMatches("form feed - \\f", "[\\f]+", "\fa");
			testMatches("vertical tab - \\v", "[\\v]+", "\va");
			testMatches("null character - \\0", "[\\0]+", "\0a");
			testMatches("control character - \\c", "[\\cj\\c@]+", "\0\na");
			testMatches("hex - \\x", "[\\x61\\x5F]+", "a_a");
			testMatches("unicode hex - \\u", "[\\u0061\\u2081]+", "a₁a");
			testMatches("octal - \\nnn", "[\\141\\060]+", "a0a");
			testMatches("octal overflow - \\nnn", "[\\141\\460]+", "a0a");
		});
	});

	suite("anchors", () =>
	{
		testMatches("string start - ^", "^a", "aaa");
		testMatches("string start - \\A", "\\Aa", "aaa");
		testMatches("string end - $", "a$", "aaa");
		testMatches("string end - \\Z", "a\\Z", "aaa");
		testMatches("string end - \\z", "a\\z", "aaa");
		testMatches("string end before newline - $", "a$", "aaa\n");
		testMatches("string end before newline - \\Z", "a\\Z", "aaa\n");
		testNoMatches("string end only - \\z", "a\\z", "aaa\n");
		testMatches("previous match - \\G", "\\Ga", "aaabaaa");
		testMatches("word boundary - \\b", "\\b.", "aba bab");
		testMatches("non word boundary - \\B", "\\B.", "aba bab");

		suite("lookaround", () =>
		{
			testMatches("lookahead - (?=)", "a(?=b)", "aabaa");
			testMatches("negative lookahead - (?!)", "a(?!b)", "aabaa");
			testMatches("lookbehind - (?<=)", "(?<=b)a", "aabaa");
			testMatches("negative lookbehind - (?<!)", "(?<!b)a", "aabaa");
			testMatches("variable length lookbehind", "(?<=ab+)c", "aabbcc");
			testMatches("groups and back references", "(.).+(?<=(\\1))", "abcabc");
		});
	});

	suite("flags", () =>
	{
		testMatches("case sensitivity", "a", "Aa");
		testMatches("case insensitivity", "a", "Aa", { flags: "i" });
		testMatches("case insensitive escapes", "\\x41\\u0041\\101", "aaa", { flags: "i" });
		testMatches("non-single-line mode", ".*", "a\r\nb\r\nc");
		testMatches("single-line mode", ".*", "a\r\nb\r\nc", { flags: "s" });
		testNoMatches("non-multi-line mode", "^\\w\\r?$", "a\r\nb\r\nc");
		testMatches("multi-line mode", "^\\w\\r?$", "a\r\nb\r\nc", { flags: "m" });
		testNoMatches("significant whitespace", "a b", "ab");
		testMatches("ignored whitespace", "a b", "ab", { flags: "x" });
		testMatches("line comments", "a # this is a comment. \nb", "ab", { flags: "x" });
		testMatches("escape ignored whitespace", "a\\ b", "a b", { flags: "x" });
		testMatches("implicit captures", "(a)(?<2>b)", "ab");
		testMatches("explicit captures", "(a)(?<2>b)", "ab", { flags: "n" });

		suite("inline", () =>
		{
			testMatches("inline - (?)", "a(?i)a*(?i-i)a", "AaAaA");
			testMatches("inline at end of sequence", "a(?i)", "AaAaA");
			testMatches("scoped inline - (?)", "(?:a(?i)a*)a", "AaAaA");
			testMatches("scoped - (?:)", "a(?i:a*)a", "AaAaA");
			testNoParse("invalid flag", "(?a)");
			testNoParse("missing flags", "(?)");
		});
	});

	suite("right to left", () =>
	{
		testMatches("literal text", "ab?", "aab", { rightToLeft: true });
		testMatches("repetition", "a+?b+", "baabb", { rightToLeft: true });
		testMatches("back references", "\\1?(a)", "aaa", { rightToLeft: true });
	});

	suite("replacement", () =>
	{
		testReplace("literal text", "\\w+", "this is a test", "abc");
		testReplace("unused escape - $", "\\w+", "a", "a$b");
		testReplace("literal escape - $$", "\\w+", "a", "a$$b");
		testReplace("group - $n", "(a)(b(?<20>c))", "abc", "$0-$1-$2-$20-$10");
		testReplace("group - ${n}", "a(b)", "ab", "${1}${2}");
		testReplace("named group - ${}", "a(?<A>b)", "ab", "${A}");
		testReplace("unmatched group", "(a)(b)?", "a", "$1-$2");
		testReplace("whole match - $&", "bc", "abcd", "-$&-");
		testReplace("whole input - $_", "b", "abc", "-$_-");
		testReplace("preceding input - $`", "b", "abc", "-$`-");
		testReplace("following input - $'", "b", "abc", "-$'-");

		suite("last group", () =>
		{
			testReplace("last group - $+", "(a)(b)", "ab", "$+");
			testReplace("missing last group - $+", "(a)(b)?", "a", "$+");
			testReplace("last named group", "(?<A>a)(?<B>b)(?<A>c)", "abc", "$+");
			testReplace("no last group", "ab", "ab", "$+");
			testReplace("mixed numbered and named groups 1", "(?<A>a)(?<2>b)(?<B>c)", "abc", "$+");
			testReplace("mixed numbered and named groups 2", "(?<A>a)(?<3>b)(?<B>c)", "abc", "$+");
			testReplace("mixed numbered and named groups 3", "(?<A>a)(?<10>b)(?<B>c)", "abc", "$+");
		});
	});
});

suite("API", () =>
{
	suite("Regex", () =>
	{
		suite("constructor()", () =>
		{
			test("parse", () =>
			{
				assert.doesNotThrow(() => new ncre.Regex("a"));
			});
		});
		suite("isMatch()", () =>
		{
			test("success", () =>
			{
				assert.strictEqual(new ncre.Regex("a").isMatch("a"), true);
			});
			test("failure", () =>
			{
				assert.strictEqual(new ncre.Regex("a").isMatch("b"), false);
			});
			test("start index", () =>
			{
				assert.strictEqual(new ncre.Regex("a").isMatch("ab", 1), false);
			});
			test("right to left", () =>
			{
				assert.strictEqual(new ncre.Regex("a", { rightToLeft: true }).isMatch("ab", 1), true);
			});
		});
		suite("match()", () =>
		{
			test("success", () =>
			{
				const match = new ncre.Regex("a").match("a");
				assert.ok(match);
				assert.strictEqual(match.success, true);
			});
			test("failure", () =>
			{
				const match = new ncre.Regex("a").match("b");
				assert.ok(match);
				assert.strictEqual(match.success, false);
			});
			test("start index", () =>
			{
				const match = new ncre.Regex(".").match("abc", 1);
				assert.ok(match);
				assert.strictEqual(match.index, 1);
			});
			test("substring", () =>
			{
				const match = new ncre.Regex("(?<=(.*)).(?=(.*))").match("abcde", 1, 3);
				assert.ok(match);
				assert.strictEqual(match.index, 1);
				assert.strictEqual(match.value, "b");
				assert.strictEqual(match.group(1).value, "");
				assert.strictEqual(match.group(2).value, "cd");
			});
			test("right to left", () =>
			{
				const match = new ncre.Regex("a", { rightToLeft: true }).match("aaaa", 1, 2);
				assert.ok(match);
				assert.strictEqual(match.index, 2);
			});
		});
		suite("matches()", () =>
		{
			test("success", () =>
			{
				const matches = new ncre.Regex("a").matches("a");
				assert.ok(matches);
				assert.strictEqual(matches.length, 1);
				assert.ok(matches[0]);
				assert.strictEqual(matches[0].success, true);
			});
			test("failure", () =>
			{
				const matches = new ncre.Regex("a").matches("b");
				assert.ok(matches);
				assert.strictEqual(matches.length, 0);
			});
			test("multiple matches", () =>
			{
				const matches = new ncre.Regex("[ab]").matches("aba");
				assert.ok(matches);
				assert.strictEqual(matches.length, 3);
				for (let i = 0; i < matches.length; i++)
				{
					const match = matches[i];
					assert.ok(match);
					assert.strictEqual(match.success, true);
					assert.strictEqual(match.index, i);
					assert.strictEqual(match.value, i === 1 ? "b" : "a");
				}
			});
			test("empty matches", () =>
			{
				const matches = new ncre.Regex("a*").matches("aabca");
				assert.ok(matches);
				assert.strictEqual(matches.length, 5);
				assert.ok(matches[0]);
				assert.strictEqual(matches[0].success, true);
				assert.strictEqual(matches[0].index, 0);
				assert.strictEqual(matches[0].value, "aa");
				assert.ok(matches[1]);
				assert.strictEqual(matches[1].success, true);
				assert.strictEqual(matches[1].index, 2);
				assert.strictEqual(matches[1].value, "");
				assert.ok(matches[2]);
				assert.strictEqual(matches[2].success, true);
				assert.strictEqual(matches[2].index, 3);
				assert.strictEqual(matches[2].value, "");
				assert.ok(matches[3]);
				assert.strictEqual(matches[3].success, true);
				assert.strictEqual(matches[3].index, 4);
				assert.strictEqual(matches[3].value, "a");
				assert.ok(matches[4]);
				assert.strictEqual(matches[4].success, true);
				assert.strictEqual(matches[4].index, 5);
				assert.strictEqual(matches[4].value, "");
			});
			test("start index", () =>
			{
				const matches = new ncre.Regex(".").matches("abc", 1);
				assert.ok(matches);
				assert.strictEqual(matches.length, 2);
				assert.ok(matches[0]);
				assert.strictEqual(matches[0].index, 1);
				assert.ok(matches[1]);
				assert.strictEqual(matches[1].index, 2);
			});
			test("right to left", () =>
			{
				const matches = new ncre.Regex("a", { rightToLeft: true }).matches("aaaa", 2);
				assert.ok(matches);
				assert.strictEqual(matches.length, 2);
				assert.ok(matches[0]);
				assert.strictEqual(matches[0].index, 1);
				assert.ok(matches[1]);
				assert.strictEqual(matches[1].index, 0);
			});
		});
		suite("replace()", () =>
		{
			test("once", () =>
			{
				const result = new ncre.Regex("a").replace("abc", "xyz");
				assert.strictEqual(result, "xyzbc");
			});
			test("multiple", () =>
			{
				const result = new ncre.Regex("a").replace("banana", "xyz");
				assert.strictEqual(result, "bxyznxyznxyz");
			});
			test("limited", () =>
			{
				const result = new ncre.Regex("a").replace("banana", "xyz", 2);
				assert.strictEqual(result, "bxyznxyzna");
			});
			test("start index", () =>
			{
				const result = new ncre.Regex("a").replace("banana", "xyz", -1, 2);
				assert.strictEqual(result, "banxyznxyz");
			});
			test("right to left", () =>
			{
				const result = new ncre.Regex("\\d", { rightToLeft: true }).replace("1a2b3c4d5e6f", "x", 2, 6);
				assert.strictEqual(result, "1axbxc4d5e6f");
			});
			test("custom function", () =>
			{
				const result = new ncre.Regex(".{2}").replace("banana", m => m.value.split("").reverse().join(""));
				assert.strictEqual(result, "abanan");
			});
		});
		suite("split()", () =>
		{
			test("simple", () =>
			{
				const result = new ncre.Regex("\\d+").split("123abc456def");
				assert.deepStrictEqual(result, ["", "abc", "def"]);
			});
			test("limited", () =>
			{
				const result = new ncre.Regex("\\d+").split("123abc456def", 2);
				assert.deepStrictEqual(result, ["", "abc456def"]);
			});
			test("start index", () =>
			{
				const result = new ncre.Regex("\\d+").split("123abc456def", 0, 3);
				assert.deepStrictEqual(result, ["123abc", "def"]);
			});
			test("right to left", () =>
			{
				const result = new ncre.Regex("\\d", { rightToLeft: true }).split("1a2b3c4d5e6f", 3, 6);
				assert.deepStrictEqual(result, ["1a", "b", "c4d5e6f"]);
			});
		});
		const unescapedASCII = "\b\t\n\f\r !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
		const escapedASCII = "\b\\t\\n\\f\\r\\ !\"\\#\\$%&'\\(\\)\\*\\+,-\\./0123456789:;<=>\\?@ABCDEFGHIJKLMNOPQRSTUVWXYZ\\[\\\\]\\^_`abcdefghijklmnopqrstuvwxyz\\{\\|}~";
		suite("escape()", () =>
		{
			test("ASCII", () =>
			{
				assert.strictEqual(ncre.Regex.escape(unescapedASCII), escapedASCII);
			});
		});
		suite("unescape()", () =>
		{
			test("ASCII", () =>
			{
				assert.strictEqual(ncre.Regex.unescape(escapedASCII), unescapedASCII);
			});
			test("valid characters", () =>
			{
				const escaped = "\\\u0000\\\u0001\\\u0002\\\u0003\\\u0004\\\u0005\\\u0006\\\u0007\\\b\\\t\\\n\\\u000b\\\f\\\r\\\u000e\\\u000f\\\u0010\\\u0011\\\u0012\\\u0013\\\u0014\\\u0015\\\u0016\\\u0017\\\u0018\\\u0019\\\u001a\\\u001b\\\u001c\\\u001d\\\u001e\\\u001f\\ \\!\\\"\\#\\$\\%\\&\\'\\(\\)\\*\\+\\,\\-\\.\\/\\0\\1\\2\\3\\4\\5\\6\\789\\:\\;\\<\\=\\>\\?\\@ABCDEFGHIJKLMNOPQRSTUVWXYZ\\[\\\\\\]\\^_\\`\\a\\bcd\\e\\fghijklm\\nopq\\rs\\tu\\vwxyz\\{\\|\\}\\~\\";
				const unescaped = "\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !\"#$%&'()*+,-./\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u000789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`\u0007\bcd\u001b\fghijklm\nopq\rs\tu\u000bwxyz{|}~";
				assert.strictEqual(ncre.Regex.unescape(escaped), unescaped);
			});
			test("valid sequences", () =>
			{
				const escaped = "\\12\\x0b\\u000c\\cM";
				const unescaped = "\u000a\u000b\u000c\u000d";
				assert.strictEqual(ncre.Regex.unescape(escaped), unescaped);
			});
			test("invalid escapes", () =>
			{
				assert.throws(() => ncre.Regex.unescape("\\A"));
				assert.throws(() => ncre.Regex.unescape("\\9"));
				assert.throws(() => ncre.Regex.unescape("\\c0"));
				assert.throws(() => ncre.Regex.unescape("\\x0"));
				assert.throws(() => ncre.Regex.unescape("\\u0"));
			});
		});
	});

	suite("Match", () =>
	{
		test("captures", () =>
		{
			const match = new ncre.Regex("de").match("abcde");
			assert.ok(match);
			assert.ok(match.captures);
			assert.strictEqual(match.captures.length, 1);
		});
		test("name", () =>
		{
			const match = new ncre.Regex("de").match("abcde");
			assert.ok(match);
			assert.strictEqual(match.name, "0");
		});
		test("success", () =>
		{
			const match = new ncre.Regex("de").match("abcde");
			assert.ok(match);
			assert.strictEqual(match.success, true);
		});
		test("index", () =>
		{
			const match = new ncre.Regex("de").match("abcde");
			assert.ok(match);
			assert.strictEqual(match.index, 3);
		});
		test("length", () =>
		{
			const match = new ncre.Regex("de").match("abcde");
			assert.ok(match);
			assert.strictEqual(match.length, 2);
		});
		test("value", () =>
		{
			const match = new ncre.Regex("de").match("abcde");
			assert.ok(match);
			assert.strictEqual(match.value, "de");
		});
		test("nextMatch()", () =>
		{
			let match = new ncre.Regex("a?").match("aab");
			assert.ok(match);
			assert.strictEqual(match.success, true);
			assert.strictEqual(match.index, 0);
			assert.strictEqual(match.value, "a");

			match = match.nextMatch();
			assert.ok(match);
			assert.strictEqual(match.success, true);
			assert.strictEqual(match.index, 1);
			assert.strictEqual(match.value, "a");

			match = match.nextMatch();
			assert.ok(match);
			assert.strictEqual(match.success, true);
			assert.strictEqual(match.index, 2);
			assert.strictEqual(match.value, "");

			match = match.nextMatch();
			assert.ok(match);
			assert.strictEqual(match.success, true);
			assert.strictEqual(match.index, 3);
			assert.strictEqual(match.value, "");

			match = match.nextMatch();
			assert.ok(match);
			assert.strictEqual(match.success, false);
		});
		test("result()", () =>
		{
			const result = new ncre.Regex("b").match("ab").result("c");
			assert.strictEqual(result, "c");

			assert.throws(() => ncre.Match.empty.result(""));
		});
		suite("group()", () =>
		{
			test("numbered groups", () =>
			{
				const match = new ncre.Regex("(a+)b+(b+)?").match("aaabbb");
				assert.ok(match);
				assert.strictEqual(match.success, true);
				assert.ok(match.group(1));
				assert.ok(match.group(2));
				assert.strictEqual(match.group(1).success, true);
				assert.strictEqual(match.group(2).success, false);
			});
			test("named groups", () =>
			{
				const match = new ncre.Regex("(a+)b+(?<A>b+)?").match("aaabbb");
				assert.ok(match);
				assert.strictEqual(match.success, true);
				assert.ok(match.group("1"));
				assert.ok(match.group("A"));
				assert.strictEqual(match.group("1").success, true);
				assert.strictEqual(match.group("A").success, false);
			});
			test("nonexistent numbered groups", () =>
			{
				const match = new ncre.Regex("a(b)").match("ab");
				assert.ok(match);
				assert.strictEqual(match.success, true);
				assert.strictEqual(match.group(2), undefined);
			});
			test("nonexistent named groups", () =>
			{
				const match = new ncre.Regex("a(?<A>b)").match("ab");
				assert.ok(match);
				assert.strictEqual(match.success, true);
				assert.strictEqual(match.group("B"), undefined);
			});
		});
	});
});

function testParse(feature, regex, options, only)
{
	(only ? test.only : test)(feature, () =>
	{
		assert.doesNotThrow(() => new ncre.Regex(regex), "NCRE parsing threw an error.");
		assert.doesNotThrow(() => dotnet.parse({ regex, options }, true), ".NET parsing threw an error.");
	});
}

function testNoParse(feature, regex, options, only)
{
	(only ? test.only : test)(feature, () =>
	{
		assert.throws(() => new ncre.Regex(regex), "NCRE parsing did not throw an error.");
		assert.throws(() => dotnet.parse({ regex, options }, true), ".NET parsing did not throw an error.");
	});
}

function testMatches(feature, regex, input, options, only)
{
	(only ? test.only : test)(feature, () =>
	{
		doMatches(regex, input, options, true, "No match found.");
	});
}

function testNoMatches(feature, regex, input, options, only)
{
	(only ? test.only : test)(feature, () =>
	{
		doMatches(regex, input, options, false, "Unexpected match found.");
	});
}

function testReplace(feature, regex, input, replacement, options, only)
{
	(only ? test.only : test)(feature, () =>
	{
		const actual = new ncre.Regex(regex, options).replace(input, replacement);
		const expected = dotnet.replace({ regex, input, replacement, options }, true);
		assert.strictEqual(actual, expected);
	});
}

function doMatches(regex, input, options, success, successText)
{
	let actual = new ncre.Regex(regex, options).matches(input);
	const expected = dotnet.matches({ regex, input, options }, true);
	// Restrict comparison to public API properties.
	actual = actual.map(m =>
	{
		const { regex, input, nextIndex, collapsedGroupList, ...rest } = m;
		return rest;
	});
	// Edge deserializes Match.groups as an array, so convert it to a Map.
	expected.forEach(m => m.groups = new Map(m.groups.map(g => [g.name, g])));
	assert.deepEqual(actual, expected, "Matches are not equal.");
	assert.strictEqual(actual.length > 0, success, successText);
}
