import {smartDecisionEngine} from '../AI_Memory/smartDecisionEngine.js';
import {MOVE_TYPES} from './constants.js';

export default class AIController {
    constructor(self, opponent, useBackend = false) {
        this.self = self;
        this.opponent = opponent;
        this.useBackend = useBackend;
        this.backendUrl = 'http://localhost:4000/api/mita-decision';
        this.fallbackToLocal = true; // If backend fails, use local AI

        this.memory = {
            lastDecisionTime: 0,
            state: 'idle', // idle, attack, chase, defend
            comboQueue: [],
            cooldownUntil: 0
        };

        this.reactionDelay = 150; // ms between decisions
    }

    async decideMove() {
        const now = Date.now();

        if (now < this.memory.cooldownUntil) return; // respecting cooldowns
        if (now - this.memory.lastDecisionTime < this.reactionDelay) return;

        // Process Combo if Active
        if (this.memory.comboQueue.length > 0) {
            const nextMove = this.memory.comboQueue.shift();
            this.execute(nextMove);
            this.memory.lastDecisionTime = now;
            return;
        }

        let aiMove;

        // Get move from AI brain (backend or local)
        if (this.useBackend) {
            try {
                aiMove = await this.getBackendDecision();
            } catch (error) {
                console.error('Backend AI error:', error);
                if (this.fallbackToLocal) {
                    console.log('Falling back to local AI');
                    aiMove = smartDecisionEngine(this.self, this.opponent);
                } else {
                    // If no fallback, just stand
                    aiMove = 'stand';
                }
            }
        } else {
            aiMove = smartDecisionEngine(this.self, this.opponent);
        }

        // Inject combo logic
        if (Array.isArray(aiMove)) {
            this.memory.comboQueue = aiMove.slice(); // copy the combo
            const nextComboMove = this.memory.comboQueue.shift();
            this.execute(nextComboMove);
        } else {
            this.execute(aiMove);
        }

        this.memory.lastDecisionTime = now;
    }

    async getBackendDecision() {
        // Prepare game state for the backend
        const gameState = {
            fighter: {
                life: this.self.life,
                x: this.self.x
            },
            opponent: {
                life: this.opponent.life,
                x: this.opponent.x
            }
        };

        // Call the backend API
        const response = await fetch(this.backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gameState)
        });

        if (!response.ok) {
            throw new Error(`Backend API error: ${response.status}`);
        }

        const data = await response.json();

        // Convert backend move format (UPPERCASE) to local format (lowercase with underscores)
        if (data.move) {
            // Convert "HIGH_PUNCH" to "high_punch" or "HIGH-PUNCH" to "high_punch"
            const move = data.move.toLowerCase().replace(/-/g, '_');

            // Validate that the move is supported
            const validMoves = [
                'high_punch', 'low_punch', 'high_kick', 'low_kick', 
                'uppercut', 'jump', 'block', 'walk_forward', 'walk_backward'
            ];

            if (validMoves.includes(move)) {
                return move;
            } else {
                console.warn(`Backend returned unsupported move: ${move}. Using default move.`);
                return 'stand'; // Default to standing if move is invalid
            }
        } else {
            throw new Error('Invalid response from backend');
        }
    }

    execute(move) {
        switch (move) {
            case 'high_punch':
                this.self.setMove(MOVE_TYPES.HIGH_PUNCH);
                break;
            case 'low_punch':
                this.self.setMove(MOVE_TYPES.LOW_PUNCH);
                break;
            case 'high_kick':
                this.self.setMove(MOVE_TYPES.HIGH_KICK);
                break;
            case 'low_kick':
                this.self.setMove(MOVE_TYPES.LOW_KICK);
                break;
            case 'uppercut':
                this.self.setMove(MOVE_TYPES.UPPERCUT);
                this.memory.cooldownUntil = Date.now() + 600; // Big move, delay next decision
                break;
            case 'jump':
                this.self.setMove(MOVE_TYPES.JUMP);
                break;
            case 'block':
                this.self.setMove(MOVE_TYPES.BLOCK);
                break;
            case 'walk_forward':
                this.self.setMove(MOVE_TYPES.WALK);
                break;
            case 'walk_backward':
                this.self.setMove(MOVE_TYPES.WALK_BACKWARD);
                break;
            case 'taunt':
                this.self.setMove(MOVE_TYPES.STAND);
                break;
            default:
                this.self.setMove(MOVE_TYPES.STAND);
        }
    }
}
