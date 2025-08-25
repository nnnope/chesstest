import json

def analyze_puzzle_difficulty(filename):
    """Analyze the actual delta_cp values to set better thresholds"""
    with open(filename, 'r') as f:
        puzzles = json.load(f)
    
    deltas = []
    tactical_qualities = []
    
    for puzzle in puzzles:
        delta = puzzle.get('delta_cp', 0)
        deltas.append(delta)
        
        motifs = puzzle.get('motifs', [])
        tactical_score = 0
        
        # Score tactical value
        high_value_motifs = ['mate', 'checkmate', 'sacrifice', 'smotheredMate', 'backRankMate']
        medium_value_motifs = ['fork', 'pin', 'skewer', 'discovered', 'deflection', 'decoy']
        tactical_motifs = ['capture', 'attack', 'tactics']
        
        for motif in motifs:
            if any(hv in motif.lower() for hv in high_value_motifs):
                tactical_score += 3
            elif any(mv in motif.lower() for mv in medium_value_motifs):
                tactical_score += 2
            elif any(tm in motif.lower() for tm in tactical_motifs):
                tactical_score += 1
        
        # Penalize obvious non-tactical patterns
        bad_motifs = ['blunder', 'mistake', 'inaccuracy', 'opening', 'endgame']
        for motif in motifs:
            if any(bm in motif.lower() for bm in bad_motifs):
                tactical_score -= 1
        
        tactical_qualities.append({
            'id': puzzle.get('id'),
            'delta': delta,
            'tactical_score': tactical_score,
            'motifs': motifs,
            'pv_length': len(puzzle.get('pv', '').split()),
            'best_move': puzzle.get('best_move_uci')
        })
    
    deltas.sort()
    print(f"Delta CP analysis for {filename}:")
    print(f"Min: {min(deltas)}, Max: {max(deltas)}")
    print(f"25th percentile: {deltas[len(deltas)//4]}")
    print(f"50th percentile: {deltas[len(deltas)//2]}")
    print(f"75th percentile: {deltas[3*len(deltas)//4]}")
    
    # Suggest better thresholds
    easy_threshold = deltas[len(deltas)//3]
    hard_threshold = deltas[2*len(deltas)//3]
    
    print(f"\nSuggested thresholds:")
    print(f"Easy (bottom 33%): delta_cp < {easy_threshold}")
    print(f"Medium (middle 33%): {easy_threshold} <= delta_cp < {hard_threshold}")
    print(f"Hard (top 33%): delta_cp >= {hard_threshold}")
    
    print(f"\nTactical quality analysis:")
    tactical_qualities.sort(key=lambda x: x['tactical_score'], reverse=True)
    
    print("Best tactical puzzles:")
    for i, tq in enumerate(tactical_qualities[:5]):
        print(f"  {i+1}. {tq['id']}: score={tq['tactical_score']}, delta={tq['delta']}, motifs={tq['motifs']}")
    
    print("\nWorst tactical puzzles (might be positional):")
    for i, tq in enumerate(tactical_qualities[-5:]):
        print(f"  {tq['id']}: score={tq['tactical_score']}, delta={tq['delta']}, motifs={tq['motifs']}")

if __name__ == "__main__":
    analyze_puzzle_difficulty('puzzles_all.json')
