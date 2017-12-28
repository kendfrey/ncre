"use strict";

const ncre = require("../dist/ncre.js");
const edge = require("edge-js");
const testClass = { assemblyFile: require("path").join(__dirname, "test.dll"), typeName: "Ncre.Test" };
const dotnet =
{
	parse: edge.func({ ...testClass, methodName: "Parse" }),
	match: edge.func({ ...testClass, methodName: "Match" })
};
// Pre-load the CLR to avoid affecting first test performance.
dotnet.parse({ regex: "" }, true);

const assert = require("assert");
suite("regex engine", () =>
{
	suite("basics", () =>
	{
		testMatch("literal text", "abb", "ababbb");
		testMatch("failed match", "a", "b");
	});

	suite("escape sequences", () =>
	{
		testMatch("literal - \\", "a\\+", "aaa+");
		testParseError("invalid sequence", "\\q");
		testMatch("digit - \\d", "\\d+", "abc1234567890def");
		testMatch("non-digit - \\D", "\\D+", "abc1234567890def");
		testMatch("word character - \\w", "\\w+", "(a_123)");
		testMatch("non-word character - \\W", "\\W+", "(a_123)");
		testMatch("whitespace - \\s", "\\s+", "a\r \nb");
		testMatch("non-whitespace - \\S", "\\S+", "a\r \nb");
		testMatch("tab - \\t", "\\t+", "\ta");
		testMatch("carriage return - \\r", "\\r+", "\ra");
		testMatch("newline - \\n", "\\n+", "\na");
		testMatch("alert - \\a", "\\a+", "\x07a");
		testMatch("escape - \\e", "\\e+", "\x1Ba");
		testMatch("form feed - \\f", "\\f+", "\fa");
		testMatch("vertical tab - \\v", "\\v+", "\va");
	});

	suite("repetition", () =>
	{
		testMatch("zero or one - ?", "ab?c?a?", "aba");
		testMatch("zero or more - *", "b*a*", "aabbb");
		testMatch("one or more - +", "b+", "aabbb");
		testParseError("invalid character - ?", "?a");
		testParseError("invalid character - *", "*a");
		testParseError("invalid character - +", "+a");

		suite("lazy", () =>
		{
			testMatch("lazy zero or one - ??", "ab??", "ab");
			testMatch("lazy zero or more - *?", "a*?b*?", "aabbb");
			testMatch("lazy one or more - +?", "a+?b+?", "aabbb");
		});
	});

	suite("groups", () =>
	{
		testMatch("non-capturing - (?:)", "a(?:b(?:c)?)*", "abbccb");
		testParseError("mismatched parentheses - (", "(a");
		testParseError("mismatched parentheses - )", ")a");

		suite("capturing", () =>
		{
			testMatch("captured - ()", "(a(b)*)*(b)", "aabbbaab");
			testMatch("named - (?<>)", "(?<A>a)+(b)", "aab");
			testMatch("named - (?'')", "(?'A'a)+(b)", "aab");
			testMatch("numbered", "(?<3>a)+(b)", "aab");
			testMatch("duplicate names", "(?<A>a)+(?<A>b)", "aab");
			testMatch("duplicate numbers", "(a)+(?<1>b)", "aab");
			testMatch("case sensitive names", "(?<A>a)+(?<a>b)", "aab");
			testParseError("invalid names", "(?<1a>)");
			testParse("underscored names", "(?<_1a>)");
			testParseError("invalid zero", "(?<0>)");
		});
	});

	suite("character classes", () =>
	{
		testMatch("inclusive - []", "[a-z0]+", "123abc0123");
		testMatch("exclusive - [^]", "[^a-z0]+", "123abc0123");
		testParseError("mismatched brackets - [", "[");
		testParse("mismatched brackets - ]", "]");
		testMatch("literal hyphens - -", "[a-]+", "a-z");
		testMatch("subtraction - -[]", "[a-z-[ad]]+", "abcdef");

		suite("escape sequences", () =>
		{
			testMatch("literal - \\", "[[\\]a]+", "ab][[]ab");
			testParseError("invalid sequence", "[\\q]");
			testMatch("digit - \\d", "[\\d]+", "abc1234567890def");
			testMatch("non-digit - \\D", "[\\D]+", "abc1234567890def");
			testMatch("word character - \\w", "[\\w]+", "(a_123)");
			testMatch("non-word character - \\W", "[\\W]+", "(a_123)");
			testMatch("whitespace - \\s", "[\\s]+", "a\r \nb");
			testMatch("non-whitespace - \\S", "[\\S]+", "a\r \nb");
			testMatch("tab - \\t", "[\\t]+", "\ta");
			testMatch("carriage return - \\r", "[\\r]+", "\ra");
			testMatch("newline - \\n", "[\\n]+", "\na");
			testMatch("alert - \\a", "[\\a]+", "\x07a");
			testMatch("backspace - \\b", "[\\b]+", "\ba");
			testMatch("escape - \\e", "[\\e]+", "\x1Ba");
			testMatch("form feed - \\f", "[\\f]+", "\fa");
			testMatch("vertical tab - \\v", "[\\v]+", "\va");
		});
	});

	suite("flags", () =>
	{
		testMatch("case sensitivity", "a", "Aa");
		testMatch("case insensitivity", "a", "Aa", { flags: "i" });

		suite("inline", () =>
		{
			testMatch("inline - (?)", "a(?i)a*(?i-i)a", "AaAaA");
			testMatch("scoped inline - (?)", "(?:a(?i)a*)a", "AaAaA");
			testMatch("scoped - (?:)", "a(?i:a*)a", "AaAaA");
			testParseError("invalid flag", "(?a)");
			testParseError("missing flags", "(?)");
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
	});

	suite("Match", () =>
	{
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

function testParse(feature, regex, only)
{
	(only ? test.only : test)(feature, () =>
	{
		assert.doesNotThrow(() => new ncre.Regex(regex), "NCRE parsing threw an error.");
		assert.doesNotThrow(() => dotnet.parse({ regex }), ".NET parsing threw an error.");
	});
}

function testParseError(feature, regex, only)
{
	(only ? test.only : test)(feature, () =>
	{
		assert.throws(() => new ncre.Regex(regex), "NCRE parsing did not throw an error.");
		assert.throws(() => dotnet.parse({ regex }), ".NET parsing did not throw an error.");
	});
}

function testMatch(feature, regex, input, options, only)
{
	options = options || {};
	(only ? test.only : test)(feature, () =>
	{
		const actual = new ncre.Regex(regex, options).match(input);
		const expected = dotnet.match({ regex, input, options }, true);
		// Edge deserializes an array, so convert it to a Map.
		expected.groups = new Map(expected.groups.map(g => [g.name, g]));
		assert.deepEqual(actual, expected, "Matches are not equal.")
	});
}
