import json
import sys

def validate_puzzle_data(filename):
    """Check puzzle data for common issues"""
    print(f"Validating {filename}...")
    
    with open(filename, 'r') as f:
        puzzles = json.load(f)
    
    issues = []
    valid_puzzles = []
    
    for i, puzzle in enumerate(puzzles):
        puzzle_issues = []
        
        # Check required fields
        required_fields = ['id', 'fen_before', 'best_move_uci', 'side_to_move']
        for field in required_fields:
            if not puzzle.get(field):
                puzzle_issues.append(f"Missing {field}")
        
        # Check FEN validity (basic check)
        fen = puzzle.get('fen_before', '')
        if fen:
            fen_parts = fen.split()
            if len(fen_parts) < 4:
                puzzle_issues.append("Invalid FEN format")
            
        # Check UCI move format
        uci = puzzle.get('best_move_uci', '')
        if uci and (len(uci) < 4 or len(uci) > 5):
            puzzle_issues.append(f"Invalid UCI move: {uci}")
        
        # Check PV format
        pv = puzzle.get('pv', '')
        if pv:
            pv_moves = pv.split()
            for move in pv_moves:
                if len(move) < 4 or len(move) > 5:
                    puzzle_issues.append(f"Invalid PV move: {move}")
                    break
        
        if puzzle_issues:
            issues.append({
                'index': i,
                'id': puzzle.get('id', 'unknown'),
                'issues': puzzle_issues
            })
        else:
            valid_puzzles.append(puzzle)
    
    # Report results
    print(f"Total puzzles: {len(puzzles)}")
    print(f"Valid puzzles: {len(valid_puzzles)}")
    print(f"Problematic puzzles: {len(issues)}")
    
    if issues:
        print("\nProblematic puzzles:")
        for issue in issues[:10]:  # Show first 10
            print(f"  Puzzle {issue['index']} ({issue['id']}): {', '.join(issue['issues'])}")
        if len(issues) > 10:
            print(f"  ... and {len(issues) - 10} more")
    
    # Create clean version if we found issues
    if issues and valid_puzzles:
        clean_filename = filename.replace('.json', '_clean.json')
        with open(clean_filename, 'w') as f:
            json.dump(valid_puzzles, f, indent=2)
        print(f"\nCreated clean version: {clean_filename}")
    
    return len(issues) == 0

if __name__ == "__main__":
    files = ['puzzles_all.json', 'puzzles_top200.json'] if len(sys.argv) < 2 else sys.argv[1:]
    
    for filename in files:
        try:
            validate_puzzle_data(filename)
            print()
        except Exception as e:
            print(f"Error validating {filename}: {e}")
