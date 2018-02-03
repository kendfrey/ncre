"use strict";

const ncre = require("../dist/ncre.js");
const edge = require("edge-js");
const testClass = { assemblyFile: require("path").join(__dirname, "test.dll"), typeName: "Ncre.Test" };
const dotnet =
{
	parse: edge.func({ ...testClass, methodName: "Parse" }),
	match: edge.func({ ...testClass, methodName: "Match" }),
	matches: edge.func({ ...testClass, methodName: "Matches" }),
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
		testMatches("control character - \\c", "\\cJ+", "\na");
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
			testMatches("control character - \\c", "[\\cJ]+", "\na");
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
		testMatches("literal text", "ab?", "aab");
		testMatches("repetition", "a+?b+", "baabb");
		testMatches("back references", "\\1?(a)", "aaa");
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
		assert.doesNotThrow(() => dotnet.parse({ regex, options }), ".NET parsing threw an error.");
	});
}

function testNoParse(feature, regex, options, only)
{
	(only ? test.only : test)(feature, () =>
	{
		assert.throws(() => new ncre.Regex(regex), "NCRE parsing did not throw an error.");
		assert.throws(() => dotnet.parse({ regex, options }), ".NET parsing did not throw an error.");
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

function doMatches(regex, input, options, success, successText)
{
	const actual = new ncre.Regex(regex, options).matches(input);
	const expected = dotnet.matches({ regex, input, options }, true);
	// Edge deserializes Match.groups as an array, so convert it to a Map.
	expected.forEach(m => m.groups = new Map(m.groups.map(g => [g.name, g])));
	assert.deepEqual(actual, expected, "Matches are not equal.");
	assert.strictEqual(actual.length > 0, success, successText);
}
