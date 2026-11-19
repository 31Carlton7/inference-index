const ESCAPED = /[.+?^${}()|[\]\\]/g;

function pathPattern(rulePath) {
  const anchored = rulePath.endsWith("$");
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const source = body.replace(ESCAPED, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`);
}

export function parseRobots(robotsText, agentToken) {
  const groups = [];
  let group = null;
  let lastWasAgent = false;
  for (const rawLine of robotsText.split("\n")) {
    const line = rawLine.split("#")[0].trim();
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!lastWasAgent) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (group && (field === "allow" || field === "disallow") && value !== "") {
      group.rules.push({ allow: field === "allow", path: value });
    }
  }
  const token = agentToken.toLowerCase();
  const named = groups.filter((g) => g.agents.some((agent) => agent !== "*" && token.includes(agent)));
  const applicable = named.length > 0 ? named : groups.filter((g) => g.agents.includes("*"));
  return applicable.flatMap((g) => g.rules);
}

// Longest matching rule wins; on a tie Allow wins (RFC 9309).
export function isAllowed(rules, pathAndQuery) {
  let winner = null;
  for (const rule of rules) {
    if (!pathPattern(rule.path).test(pathAndQuery)) continue;
    const longer = winner === null || rule.path.length > winner.path.length;
    const tieForAllow = winner !== null && rule.path.length === winner.path.length && rule.allow;
    if (longer || tieForAllow) winner = rule;
  }
  return winner === null || winner.allow;
}
