// examples/json-manipulation/source.js
const inputData = globalThis._input;

if (!inputData || !inputData.users || !Array.isArray(inputData.users)) {
  console.error("Error: Input data must be a JSON object with a 'users' array.");
  Deno.exit(1);
}

const activeUsers = inputData.users
  .filter(user => user.isActive)
  .map(user => ({
    name: user.name,
    email: user.email
  }));

console.log(JSON.stringify(activeUsers, null, 2));
