import json, chess, chess.engine
import pathlib
from collections import defaultdict

DEFAULT_STOCKFISH = r"C:\tools\stockfish\stockfish\stockfish-windows-x86-64-avx2.exe"

def normalize_eval(score, side_to_move):
    """Convert engine score to centipawns from side_to_move perspective."""
    if hasattr(score, 'pov'):
        actual_score = score.pov(side_to_move)
    else:
        actual_score = score
    
    if actual_score.is_mate():
        m = actual_score.mate()
        return (10000 - abs(m)) * (1 if m > 0 else -1)
    return actual_score.score()

def is_tactical_position(board, best_move, pv_moves):
    """Check if this is a genuinely tactical position, not just a blunder recovery."""
    # 1. Best move should be forcing (check, capture, or threat)
    if not (board.is_capture(best_move) or board.gives_check(best_move)):
        # Allow if it creates immediate tactical threats
        board_copy = board.copy()
        board_copy.push(best_move)
        # Check if opponent is in immediate danger
        if not any(board_copy.is_capture(move) for move in board_copy.legal_moves):
            return False
    
    # 2. PV should be relatively short (2-6 moves) for sharp tactics
    if len(pv_moves) > 8:
        return False
    
    # 3. PV should contain forcing moves
    board_copy = board.copy()
    forcing_moves = 0
    for i, move_uci in enumerate(pv_moves[:4]):  # Check first 4 moves
        try:
            move = chess.Move.from_uci(move_uci)
            if board_copy.is_capture(move) or board_copy.gives_check(move):
                forcing_moves += 1
            board_copy.push(move)
        except:
            break
    
    # At least 50% of first moves should be forcing
    return forcing_moves >= len(pv_moves[:4]) * 0.5

def detect_tactical_motifs(board, best_move, pv_moves, eval_before, eval_after):
    """Detect specific tactical motifs."""
    motifs = []
    
    # Basic motifs
    if board.is_capture(best_move):
        motifs.append("capture")
    if board.gives_check(best_move):
        motifs.append("check")
    
    # Analyze the position after best move
    board_after = board.copy()
    board_after.push(best_move)
    
    # Checkmate
    if board_after.is_checkmate():
        motifs.append("mate")
        return motifs
    
    # Look for forks, pins, skewers in the resulting position
    # This is simplified - real detection would be more complex
    
    # Fork: one piece attacks multiple enemy pieces
    attacking_squares = defaultdict(list)
    for square in chess.SQUARES:
        piece = board_after.piece_at(square)
        if piece and piece.color == board.turn:
            for attacked in board_after.attacks(square):
                enemy_piece = board_after.piece_at(attacked)
                if enemy_piece and enemy_piece.color != piece.color:
                    attacking_squares[square].append(attacked)
    
    for square, attacks in attacking_squares.items():
        if len(attacks) >= 2:
            motifs.append("fork")
            break
    
    # Pin detection (simplified)
    for square in chess.SQUARES:
        piece = board_after.piece_at(square)
        if piece and piece.color != board.turn:  # Enemy piece
            pinners = board_after.pin(piece.color, square)
            if pinners:
                motifs.append("pin")
                break
    
    # Sacrifice: if we gave up significant material for position
    if board.is_capture(best_move):
        captured_piece = board.piece_at(best_move.to_square)
        moving_piece = board.piece_at(best_move.from_square)
        if captured_piece and moving_piece:
            PIECE_VALUES = {chess.PAWN:100, chess.KNIGHT:300, chess.BISHOP:300,
                            chess.ROOK:500, chess.QUEEN:900, chess.KING:0}
            material_lost = PIECE_VALUES.get(moving_piece.piece_type, 0)
            material_gained = PIECE_VALUES.get(captured_piece.piece_type, 0)
            if material_lost > material_gained + 200:  # Significant sacrifice
                motifs.append("sacrifice")
    
    return motifs

def create_better_tactical_puzzles(input_file="all_raw_tactics.json", output_file="better_tactics.json", max_puzzles=25):
    """Create a curated set of genuine tactical puzzles."""
    
    print(f"Loading puzzles from {input_file}...")
    with open(input_file) as f:
        all_puzzles = json.load(f)
    
    print(f"Filtering {len(all_puzzles)} puzzles for tactical content...")
    
    # Load engine for additional analysis
    engine_path = pathlib.Path(DEFAULT_STOCKFISH)
    if not engine_path.exists():
        print(f"Warning: Stockfish not found at {engine_path}")
        print("Proceeding without engine verification...")
        engine = None
    else:
        engine = chess.engine.SimpleEngine.popen_uci(engine_path)
    
    tactical_puzzles = []
    
    for puzzle in all_puzzles:
        try:
            # Parse position
            board = chess.Board(puzzle['fen_before'])
            best_move = chess.Move.from_uci(puzzle['best_move_uci'])
            pv_moves = puzzle.get('pv', '').split()
            
            # Basic quality filters
            delta_cp = puzzle.get('delta_cp', 0)
            
            # Skip positions that are too overwhelming (likely just blunders)
            if delta_cp > 8000:
                continue
            
            # Skip if the best move isn't in legal moves
            if best_move not in board.legal_moves:
                continue
            
            # Check if this is genuinely tactical
            if not is_tactical_position(board, best_move, pv_moves):
                continue
            
            # Detect tactical motifs
            motifs = detect_tactical_motifs(board, best_move, pv_moves, 
                                           puzzle.get('eval_cp_before', 0),
                                           puzzle.get('eval_cp_after', 0))
            
            # Require at least some tactical motifs (not just "capture")
            if not motifs or motifs == ["capture"]:
                continue
            
            # Create enhanced puzzle data
            enhanced_puzzle = puzzle.copy()
            enhanced_puzzle['tactical_motifs'] = motifs
            enhanced_puzzle['tactical_score'] = len(motifs) + (1 if 'mate' in motifs else 0) * 2
            
            # Assign better difficulty based on tactical complexity
            complexity = len(motifs) + len(pv_moves) / 4
            if 'mate' in motifs or 'sacrifice' in motifs:
                enhanced_puzzle['tactical_difficulty'] = 'Hard'
            elif complexity > 3:
                enhanced_puzzle['tactical_difficulty'] = 'Medium'
            else:
                enhanced_puzzle['tactical_difficulty'] = 'Easy'
            
            tactical_puzzles.append(enhanced_puzzle)
            
            print(f"✓ {puzzle['id']}: {motifs} (delta: {delta_cp})")
            
        except Exception as e:
            print(f"✗ Error processing {puzzle.get('id', 'unknown')}: {e}")
            continue
    
    if engine:
        engine.quit()
    
    # Sort by tactical quality
    tactical_puzzles.sort(key=lambda x: (x['tactical_score'], -x['delta_cp']), reverse=True)
    
    # Take the best ones
    final_puzzles = tactical_puzzles[:max_puzzles]
    
    # Balance difficulty distribution
    easy = [p for p in final_puzzles if p['tactical_difficulty'] == 'Easy'][:8]
    medium = [p for p in final_puzzles if p['tactical_difficulty'] == 'Medium'][:12]
    hard = [p for p in final_puzzles if p['tactical_difficulty'] == 'Hard'][:10]
    
    balanced_puzzles = easy + medium + hard
    
    print(f"\nFinal selection: {len(balanced_puzzles)} puzzles")
    print(f"Easy: {len(easy)}, Medium: {len(medium)}, Hard: {len(hard)}")
    
    # Save results
    with open(output_file, 'w') as f:
        json.dump(balanced_puzzles, f, indent=2)
    
    print(f"Saved to {output_file}")
    
    return balanced_puzzles

if __name__ == "__main__":
    create_better_tactical_puzzles(
        input_file="../tactics-miner/all_raw_tactics.json",
        output_file="tactical_puzzles_v2.json",
        max_puzzles=30
    )
