/**
 * Prints the network URLs so users on the same LAN know what address to open.
 * Run automatically by start:all via the start.bat.
 */
const { networkInterfaces } = require("os");

function getLocalIPs() {
  const nets = networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        results.push({ iface: name, address: net.address });
      }
    }
  }
  return results;
}

const dashPort  = process.env.DASH_PORT  || 5173;
const ips = getLocalIPs();

console.log("\n╔══════════════════════════════════════════════════╗");
console.log("║           ToteTrack — Network Access Info        ║");
console.log("╠══════════════════════════════════════════════════╣");
console.log(`║  Local:    http://localhost:${dashPort}               ║`);
if (ips.length === 0) {
  console.log("║  Network:  (no network adapter found)            ║");
} else {
  for (const { iface, address } of ips) {
    const url   = `http://${address}:${dashPort}`;
    const label = `${url}  (${iface})`;
    console.log(`║  Network:  ${label.padEnd(38)} ║`);
  }
}
console.log("╠══════════════════════════════════════════════════╣");
console.log("║  Share the Network URL with other devices on     ║");
console.log("║  the same WiFi / LAN to access ToteTrack.        ║");
console.log("╚══════════════════════════════════════════════════╝\n");
