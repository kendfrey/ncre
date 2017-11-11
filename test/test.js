"use strict";

const ncre = require("../dist/ncre.js");
const edge = require("edge-js");
const dotnet =
{
	match: edge.func({ assemblyFile: require("path").join(__dirname, "test.dll"), typeName: "Ncre.Test", methodName: "Match" })
};
// Pre-load the CLR to avoid affecting first test performance.
dotnet.match({ regex: "", input: "" }, true);

const assert = require("assert");
describe("Regex", () =>
{
	describe("match()", () =>
	{
		testMatch("literal text", "abb", "ababbb");
		testMatch("optional - ?", "ab?c?a?", "aba");
		testMatch("repetition - *", "b*a*", "aabbb");
		testMatch("repetition - +", "b+", "aabbb");
		testMatch("lazy optional - ??", "ab??", "ab");
		testMatch("lazy repetition - *?", "a*?b*?", "aabbb");
		testMatch("lazy repetition - +?", "a+?b+?", "aabbb");
		testMatch("non-capturing groups - (?:)", "a(?:b(?:c)?)*", "abbccb");
		testMatch("escaping - \\", "a\\+", "aaa+");
	});
});

function testMatch(feature, regex, input, only)
{
	(only ? it.only : it)(feature, () => assert.deepEqual(new ncre.Regex(regex).match(input), dotnet.match({ regex, input }, true), "Results don't match"));
}
