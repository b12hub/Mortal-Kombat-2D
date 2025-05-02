import {ARENA, IMAGE_COUNT_BY_MOVE_TYPE, MOVE_TYPES, ORIENTATIONS} from "./constants.js";
import {Fighter} from "./fighters.js";
import {draw} from "./draw.js";
import AIController from "./ai-controller.js";
import {ResourceManager} from "./resource-manager.js";
import {setMovements} from "./set-movements.js";
import {checkAttacks} from "./check-attacks.js";
import {updateLifebars} from "./update-lifebars.js";
import {checkLifes} from "./check-lifes.js";
import {setHoldMovements} from "./set-hold-movements.js";
import {recalculatePositions} from "./recalculate-positions.js";

export class Game {
  pressed = {};
  fighters = [];
  resourceManager = new ResourceManager();
  aiController = null;
  useBackendAI = false; // Default to local AI

  constructor() {
    // Check URL parameters for AI mode
    const urlParams = new URLSearchParams(window.location.search);
    const aiParam = urlParams.get('ai');
    if (aiParam === 'backend') {
      this.useBackendAI = true;
    } else if (aiParam === 'local') {
      this.useBackendAI = false;
    }
    // Could also be controlled by a localStorage setting or a UI toggle
  }

  async init() {
    this.initCanvas();
    await this.initializeFighters();
    this.addHandlers();
    this.updateAIIndicator();
    await this.animate(0);
  }

  updateAIIndicator() {
    // Create or update AI mode indicator
    let indicator = document.getElementById('ai-mode-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'ai-mode-indicator';
      indicator.style.position = 'absolute';
      indicator.style.top = '10px';
      indicator.style.right = '10px';
      indicator.style.padding = '5px 10px';
      indicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      indicator.style.color = 'white';
      indicator.style.borderRadius = '5px';
      indicator.style.fontSize = '12px';
      indicator.style.zIndex = '1000';
      document.body.appendChild(indicator);
    }

    // Update the indicator text
    indicator.textContent = `AI Mode: ${this.useBackendAI ? 'Backend (LLM)' : 'Local (Rule-based)'}`;
    indicator.style.backgroundColor = this.useBackendAI ? 'rgba(0, 128, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
  }

  initCanvas() {
    const canvas = document.getElementById('canvas');
    canvas.width = ARENA.WIDTH;
    canvas.height = ARENA.HEIGHT;
    this.context = canvas.getContext('2d');
  }

  async initializeFighters() {
    this.fighters[0] = new Fighter('subzero', ORIENTATIONS.LEFT);
    this.fighters[1] = new Fighter('kano', ORIENTATIONS.RIGHT);
    await this.loadFighterImages();

    // If backend AI is selected, check if the server is available
    if (this.useBackendAI) {
      try {
        // Create a simple test request with a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        // Send a minimal request to check server availability
        const testGameState = { fighter: { life: 100, x: 100 }, opponent: { life: 100, x: 500 } };
        const response = await fetch('http://localhost:4000/api/mita-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testGameState),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn('Backend AI server responded with an error. Falling back to local AI.');
          this.useBackendAI = false;
          this.showBackendError();
        } else {
          console.log('Successfully connected to backend AI server');
          // Update the indicator immediately
          this.updateAIIndicator();
        }
      } catch (error) {
        console.warn('Backend AI server is not available. Falling back to local AI.', error);
        this.useBackendAI = false;
        this.showBackendError();
      }
    }

    // 🔮 Mita's AI brain gets plugged in here
    this.aiController = new AIController(this.fighters[1], this.fighters[0], this.useBackendAI);

    // Log which AI system is being used
    console.log(`Using ${this.useBackendAI ? 'backend' : 'local'} AI for Mita`);
  }

  showBackendError() {
    const errorMsg = document.createElement('div');
    errorMsg.style.position = 'absolute';
    errorMsg.style.top = '50%';
    errorMsg.style.left = '50%';
    errorMsg.style.transform = 'translate(-50%, -50%)';
    errorMsg.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
    errorMsg.style.color = 'white';
    errorMsg.style.padding = '20px';
    errorMsg.style.borderRadius = '10px';
    errorMsg.style.zIndex = '2000';
    errorMsg.style.maxWidth = '80%';
    errorMsg.style.textAlign = 'center';

    errorMsg.innerHTML = `
      <h3>Backend AI Server Not Available</h3>
      <p>Could not connect to the AI server at http://localhost:4000.</p>
      <p>Make sure to start the server by running:</p>
      <pre>cd AI_Memory && node backend.js</pre>
      <p>Falling back to local AI for now.</p>
      <button id="close-error" style="padding: 5px 10px; margin-top: 10px;">OK</button>
    `;

    document.body.appendChild(errorMsg);

    document.getElementById('close-error').addEventListener('click', () => {
      errorMsg.remove();
    });

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (document.body.contains(errorMsg)) {
        errorMsg.remove();
      }
    }, 10000);
  }


  async loadFighterImages() {
    const urls = [];
    for (let moveKey in MOVE_TYPES) {
      const moveType = MOVE_TYPES[moveKey];
      for (let i = 0; i < IMAGE_COUNT_BY_MOVE_TYPE[moveType]; i++) {
        urls.push(`./images/fighters/${this.fighters[0].name}/${ORIENTATIONS.LEFT}/${moveType}/${i}.png`);
        urls.push(`./images/fighters/${this.fighters[0].name}/${ORIENTATIONS.RIGHT}/${moveType}/${i}.png`);
        urls.push(`./images/fighters/${this.fighters[1].name}/${ORIENTATIONS.LEFT}/${moveType}/${i}.png`);
        urls.push(`./images/fighters/${this.fighters[1].name}/${ORIENTATIONS.RIGHT}/${moveType}/${i}.png`);
      }
    }

    await this.resourceManager.loadImages(urls);
  }

  addHandlers() {
    document.addEventListener('keydown', event => {
      if (!this.pressed[event.code]) {
        this.pressed[event.code] = true;
        setMovements(this.fighters[0], this.fighters[1], this.pressed);
      }
    });
    document.addEventListener('keyup', event => {
      delete this.pressed[event.code];
      setMovements(this.fighters[0], this.fighters[1], this.pressed);
    });
  }

  // async reportMatchResult(winner) {
  //   const result = winner === this.fighters[1] ? 'win': 'loss';
  //   try {
  //     await fetch('/mita-result', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ result })
  //     });
  //   } catch (error) {
  //     console.error('Failed to report match result:', error);
  //   }
  // }

  async animate() {
    setHoldMovements(this.fighters[0], this.fighters[1], this.pressed);
    await this.aiController.decideMove();

    recalculatePositions(this.fighters[0], this.fighters[1]);
    checkAttacks(this.fighters[0], this.fighters[1]);
    updateLifebars(this.fighters[0], this.fighters[1]);
    checkLifes(this.fighters[0], this.fighters[1]);

    draw(this.fighters[0], this.fighters[1], this.context, this.resourceManager);

    requestAnimationFrame(() => this.animate());
  }


}
