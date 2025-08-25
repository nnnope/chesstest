# Blitz Tactics Viewer

A clean, static puzzle viewer for your chess club's tournament tactics. **No backend, no build tools** — just drop these files in a folder and open locally.

## 🚀 Quick Start

1. **Run locally** (recommended):
   ```bash
   cd viewer
   python -m http.server 8000
   ```
   Then visit: http://localhost:8000/

2. **Or double-click** `index.html` (some browsers may block file:// requests)

## 📊 Your Puzzle Collection

We've generated **50 high-quality tactical puzzles** from your tournament games:

- **Easy** (15 puzzles): 300-9,681 cp swings — Basic tactics, mate-in-1/2
- **Medium** (20 puzzles): 674-9,848 cp swings — Intermediate combinations  
- **Hard** (15 puzzles): 8,715-9,690 cp swings — Brutal tactical shots

All puzzles have **100% spot-check validation** and enhanced motif detection.

## 🎯 How to Use

1. **Select difficulty** from dropdown (Easy/Medium/Hard)
2. **Try your move** by dragging pieces on the board
3. **Get instant feedback** — ✔ correct or ✖ with the engine's best
4. **Step through solutions** using the PV navigation buttons
5. **Share puzzles** with the "Copy Link" button

## 🔧 Features

- **Interactive chessboard** with drag-and-drop moves
- **Real-time validation** against Stockfish analysis  
- **Principal Variation (PV) stepping** to see full tactical sequences
- **Shareable URLs** for individual puzzles
- **Rich metadata**: players, events, motifs, evaluation swings
- **Responsive design** works on desktop and mobile

## 📁 Files Structure

```
viewer/
├── index.html          # Main page
├── app.js             # Chess logic & interaction
├── style.css          # Dark theme styling
├── puzzles_all.json   # Easy tier (15 puzzles)
├── puzzles_medium.json # Medium tier (20 puzzles)  
├── puzzles_hard.json  # Hard tier (15 puzzles)
└── puzzles_top200.json # Top subset
```

## 🎮 Tips

- **Try multiple moves** — the viewer will tell you if you found the engine's best
- **Use PV stepping** to understand the full tactical sequence
- **Share interesting puzzles** with clubmates using the link button
- **Filter by difficulty** to match your training level

## 🧠 Puzzle Data

Each puzzle includes:
- **FEN position** with side to move
- **Best engine move** (Stockfish 17, depth 16-20)
- **Evaluation swing** in centipawns
- **Tactical motifs**: captures, sacrifices, forks, pins, deflections
- **Game metadata**: players, event, date

---

**Generated from 611 tournament games with 1,943 candidate positions**  
**Quality-filtered to 50 premium tactical moments**  

Enjoy your club's tactics training! 🏆
