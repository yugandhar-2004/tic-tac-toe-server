// Install: npm install ws node-fetch
const WebSocket = require("ws");
const fetch = require("node-fetch");

// Adalo API Key
const ADALO_API_KEY = process.env.ADALO_API_KEY || "PASTE_YOUR_API_KEY_HERE";

// Start WebSocket Server
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

let rooms = []; // Each room = {id, players: [ws1, ws2], board: ["","","",...]} 

wss.on("connection", (ws) => {
  
  ws.on("message", async (msg) => {
    const data = JSON.parse(msg);

    // ----- Player joins -----
    if (data.type === "join") {
      ws.userId = data.userId;
      ws.name = data.name;

      let room = rooms.find(r => r.players.length === 1); // find waiting room

      if (!room) {
        room = { id: Date.now(), players: [ws], board: Array(9).fill("") };
        rooms.push(room);
        ws.room = room;
        ws.send(JSON.stringify({ type: "waiting", msg: "Waiting for opponent..." }));
      } else {
        room.players.push(ws);
        ws.room = room;

        // Assign symbols
        room.players[0].symbol = "X";
        room.players[1].symbol = "O";

        // Notify both players
        room.players.forEach(p => {
          p.send(JSON.stringify({ type: "start", symbol: p.symbol }));
        });
      }
    }

    // ----- Player move -----
    if (data.type === "move") {
      const room = ws.room;
      if (!room) return;

      room.board[data.index] = ws.symbol;

      // Broadcast move
      room.players.forEach(p => {
        p.send(JSON.stringify({ type: "update", index: data.index, symbol: ws.symbol }));
      });

      // Check winner
      const winner = checkWinner(room.board);
      if (winner) {
        room.players.forEach(p => {
          p.send(JSON.stringify({ type: "winner", winnerSymbol: winner }));
        });

        // Add coins
        const winnerPlayer = room.players.find(p => p.symbol === winner);
        if (winnerPlayer) addCoinsToAdalo(winnerPlayer.userId, 10);
      }
    }

  });

  ws.on("close", () => {
    if (ws.room) {
      ws.room.players = ws.room.players.filter(p => p !== ws);
      if (ws.room.players.length === 0) {
        rooms = rooms.filter(r => r !== ws.room);
      }
    }
  });

});

// ----- Check winner -----
function checkWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

// ----- Add coins to Adalo -----
async function addCoinsToAdalo(userId, amount) {
  try {
    const url = `https://api.adalo.com/db/users/${userId}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${ADALO_API_KEY}` } });
    const user = await res.json();
    const currentCoins = user.Coins || 0;

    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADALO_API_KEY}` },
      body: JSON.stringify({ Coins: currentCoins + amount })
    });
    console.log(`Added ${amount} coins to user ${userId}`);
  } catch (err) {
    console.error("Error adding coins:", err);
  }
}
