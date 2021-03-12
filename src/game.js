import "../node_modules/babel-polyfill/dist/polyfill.js";
import * as util from "./util.js";
import "../node_modules/url-search-params-polyfill/index.js";


const EPSILON = 0.001;
const BLOCK_WIDTH = 50;
const MAX_SEARCH_TIME = 12 * 60 * 1000;
const BLOCK_COLOR = 0x81e700;
// 0xD7191C, 0xFDAE61, 0xABD9E9
const SOURCE_COLORS = [0xD7191C, 0xFDAE61, 0xABD9E9];
const TARGET_COLOR = 0xFDAE61;

const HIGHLIGHTED_BLOCK_COLOR = 0x59853b;
const DRAG_HIGHLIGHT_PERIOD = 500;
const RED_METRICS_HOST = "api.creativeforagingtask.com";
const RED_METRICS_GAME_VERSION = "";

let letsPlayScene = false;

const TRIGGERS = {
  "loadGame": 100, // When loads starts
  "startGame": 3, // When pressing the button "let's play" - (A "start game" trigger)
  "collectShape": 4, // EVENT - Every time the player presses the "collect shape" button (either in the tutorial or in game time)
  "endGame": 5, // When a player presses the "end game" button- (An "end game" trigger)
  "chooseGalleryShape": 6, // EVENT - Every time a choice of a gallery shape is done (in the "choose the 5 most creative shapes" screen)
  "galleryDone": 7, // At the gallery screen - When the player presses "all done" (An "end choice" trigger).
};


function sendTrigger(name) {
  if(!ws || ws.readyState != WebSocket.OPEN) {
    console.warn("Websocket connection not available. Skipping trigger", name);
    return;
  }

  const trigger = TRIGGERS[name];
  ws.send(trigger.toString());
}


function gridPosToPixelPos(gridPos) {
  return util.multiply(gridPos, BLOCK_WIDTH);
}

function pixelPosToGridPos(pixelPos) {
  return util.round(util.divide(pixelPos, BLOCK_WIDTH));
}  

function drawBlock(graphics, fillColor) {
  graphics.beginFill(fillColor);
  graphics.fillColor = fillColor;
  graphics.lineStyle(4, 0x000000, 1);
  graphics.drawRect(-BLOCK_WIDTH/2, -BLOCK_WIDTH/2, BLOCK_WIDTH, BLOCK_WIDTH);
  graphics.endFill();
}

// Creates blocks using different colors. For the source
function makeSourceShape(gridPos, color) {
  let rect = new PIXI.Graphics();
  drawBlock(rect, color);

  // console.log("Grid position is " + String(gridPosToPixelPos(gridPos).x) + " " + String(gridPosToPixelPos(gridPosToPixelPos).y));
  rect.position = gridPosToPixelPos(gridPos);
  return rect;
}

// Creates blocks using the color of the target.
function makeTargetShape(gridPos) {
  let rect = new PIXI.Graphics();
  drawBlock(rect, TARGET_COLOR);

  // console.log("Grid position is " + String(gridPosToPixelPos(gridPos).x) + " " + String(gridPosToPixelPos(gridPosToPixelPos).y));
  rect.position = gridPosToPixelPos(gridPos);
  return rect;
}

function convertShapeToArray(shape) {
  return shape.map(({x, y}) => [x, y]);
}

function pointToArray(p) {
  return [p.x, p.y];
}

function calculateSearchScore(shapeCount, timePlayed) {
  return Math.min(2 * ((1/88) * shapeCount * (720000 / timePlayed) - 0.5), 1);
}

function shuffle(array) {
  var res = array;
  for (let i = res.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [res[i], res[j]] = [res[j], res[i]];
  }
  return res;
}

function toggleFullscreen() {
  if(util.inFullscreen()) {
    util.exitFullscreen();
    showFullscreenIcon(true);
  } else {
    util.requestFullscreen(document.getElementById("game-parent"));
    showFullscreenIcon(false);
  }
}

function showFullscreenIcon(full) {
  if(full) {
    document.getElementById("fullscreen-button-small").style.display = "none";
    document.getElementById("fullscreen-button-full").style.display = "block";
  } else {
    document.getElementById("fullscreen-button-small").style.display = "block";
    document.getElementById("fullscreen-button-full").style.display = "none";
  }
}

function loadProgressHandler(loader, resource) {
  console.log("loading: " + resource.url); 
  console.log("progress: " + loader.progress + "%"); 
}

function setup() {
  sceneLayer = new PIXI.Container();
  app.stage.addChild(sceneLayer);

  app.ticker.add(update);

  // redmetricsConnection.postEvent({
  //   type: "start"
  // });

  if(util.supportsFullscreen(document.getElementById("game-parent"))) {
    document.getElementById("fullscreen-button").addEventListener("click", toggleFullscreen);
    showFullscreenIcon(true);
  } else {
    document.getElementById("fullscreen-button").style.display = "none";
  }

  // Start scene
  changeScene(util.getStartingScene(defaultStartingScene));
}

function changeScene(newSceneName) {
  if(currentScene) currentScene.teardown();

  currentSceneName = newSceneName;  
  currentScene = new scenes[currentSceneName];

  sceneStartedAt = Date.now();
  currentScene.setup();
  currentScene.update(0);

  // redmetricsConnection.postEvent({
  //   type: metricsStartSceneEvents[newSceneName]
  // });
}

function update(timeScale)
{
  const timeSinceStart = Date.now() - sceneStartedAt;
  currentScene.update(timeSinceStart, timeScale);

  const requestedTransition = currentScene.requestedTransition(timeSinceStart);
  if(requestedTransition != null) {
      const nextSceneName = util.provideNextScene(sceneTransitions, currentSceneName, requestedTransition);
      if(nextSceneName != null) changeScene(nextSceneName);
  }
  app.renderer.render(app.stage);
}


class IntroScene extends util.Entity {
  setup() {
    document.getElementById("intro-gui").style.display = "block";

    document.getElementById("user-provided-id").addEventListener("keyup", this.onSetUserProvidedId.bind(this));

    this.done = false;
    document.getElementById("done-intro").disabled = true;
    document.getElementById("done-intro").addEventListener("click", this.onDone.bind(this));
  }

  teardown() {
    document.getElementById("intro-gui").style.display = "none";
  }  

  requestedTransition(timeSinceStart) { return this.done ? "next" : null; }

  onSetUserProvidedId(e) {
    document.getElementById("done-intro").disabled = (document.getElementById("user-provided-id").value.length === 0);

    // If enter key pressed
    if(e.keyCode === 13 && !document.getElementById("done-intro").disabled) {
      this.onDone();
    } 
  }

  onDone() {
    playerData.customData.userProvidedId = document.getElementById("user-provided-id").value;
    // redmetricsConnection.updatePlayer(playerData);

    this.done = true;
  }
}


class TrainingScene extends util.Entity {
  setup() {
    this.done = false;
    this.didDropBlock = false;

    this.blockScene = new BlockScene(true);
    this.blockScene.setup();

    this.blockScene.preventAddingShape = true;
    document.getElementById("add-shape").style.display = "none";
    document.getElementById("done-adding").style.display = "none";

    this.blockScene.on("droppedBlock", this.onDroppedBlock, this);
    this.blockScene.on("addedShape", this.onAddedShape, this);

    document.getElementById("training-gui").style.display = "block";
    document.getElementById("pixi-canvas").addEventListener("keyup", this.onKeyUp.bind(this));
    document.getElementById("done-training-1").addEventListener("click", this.onDonePart1.bind(this));
    document.getElementById("done-training-2").addEventListener("click", this.onDonePart2.bind(this));
    document.getElementById("done-training-4").addEventListener("click", this.onDonePart4.bind(this));
    document.getElementById("done-training-5").addEventListener("click", this.finishTraining.bind(this));
  }

  finishTraining() {
    this.done = true;
    letsPlayScene = false;
    galleryShapes = [];
    sendTrigger("startGame");
  }

  update(timeSinceStart) {
    this.blockScene.update(timeSinceStart);
  }

  teardown() {
    this.blockScene.off("droppedBlock", this.onDroppedBlock, this);
    this.blockScene.off("addedShape", this.onAddedShape, this);
    this.blockScene.teardown();

    document.getElementById("done-adding").style.display = "block";
    document.getElementById("training-gui").style.display = "none";
  }

  requestedTransition(timeSinceStart) { return this.done ? "next" : null; }

  onDroppedBlock() {
    if(this.didDropBlock) return;

    this.didDropBlock = true;
    this.blockScene.highlightMovableBlocks();

    document.getElementById("done-training-1").style.display = "block";
  }

  onDonePart1() {
    document.getElementById("training-1").style.display = "none";
    document.getElementById("training-2").style.display = "block";

    // hide title
    document.getElementById("training-title").style.visibility = "hidden";
  }

  onDonePart2() {
    this.blockScene.unhighlightMovableBlocks();

    document.getElementById("training-2").style.display = "none";
    document.getElementById("training-3").style.display = "block";

    document.getElementById("add-shape").style.display = "block";
    document.getElementById("pixi-canvas").focus();
    this.blockScene.preventAddingShape = false;
  }

  onAddedShape() {
    document.getElementById("training-3").style.display = "none";
    // document.getElementById("training-5").style.display = "block";
    document.getElementById('training-4').style.display = "block";
    // this.blockScene.teardown()
    this.blockScene.resetBlocks()
    this.blockScene.off("addedShape", this.onAddedShape, this);

  }

  onDonePart4() {
    document.getElementById('training-4').style.display = "none";
    document.getElementById('training-5').style.display = "block";
    document.getElementById("pixi-canvas").focus();
    letsPlayScene = true;
    this.blockScene.removeBlocks();
  }

  onKeyUp(e) {
    // If they pressed a number key, add the shape
    if (!isNaN(parseInt(e.key))) {
      var keyValue = parseInt(e.key);
      if (keyValue == 5 && letsPlayScene) {
        this.finishTraining();
      }
    }
  }
}


class BlockScene extends util.Entity {
  setup() {
    this.done = false;
    this.draggingBlock = null;
    this.draggingBlockStartGridPosition = null;
    this.startDragTime = null;
    this.highlightedBlocks = new Set();
    this.targetBlockContainerPosition = new PIXI.Point();
    this.lastMouseUpTime = 0;
    this.draggingPointerId = null;
    this.preventAddingShape = false;
    this.timesUp = false;
    this.changedShape = true;

    this.numberTrials = numTrials;
    this.currentTrial = 1;
    this.canChangeTrial = false;

    this.mouseOverBlock = null;

    this.container = new PIXI.Container();
    sceneLayer.addChild(this.container);

    this.generateRandomVariables();
    this.resetTrial();
    // HTML
    document.getElementById("blocks-gui").style.display = "block";

    // This is dumb, but required so that removeEventListener works correctly with bind()
    this.onAddShape = this.onAddShape.bind(this);
    this.onAttemptDone = this.onAttemptDone.bind(this);
    this.cancelModal = this.cancelModal.bind(this);
    this.confirmDone = this.confirmDone.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.nextTrial = this.nextTrial.bind(this);
    this.resetTrial = this.resetTrial.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    document.getElementById("continue-btn").addEventListener("click", this.nextTrial);
    document.getElementById("reset-btn").addEventListener("click", this.resetTrial);
    document.getElementById("modal-confirm-cancel-button").addEventListener("click", this.cancelModal);
    document.getElementById("modal-confirm-done-button").addEventListener("click", this.confirmDone);
    document.getElementById("pixi-canvas").addEventListener("keyup", this.onKeyUp);
    document.getElementById("pixi-canvas").addEventListener("mousemove", this.onMouseMove);

    // Don't allow player to leave early if allowEarlyExit is false
    // const doneAddingButton = document.getElementById("done-adding");
    // doneAddingButton.addEventListener("click", this.onAttemptDone);
    // doneAddingButton.disabled = !allowEarlyExit;
  }

  generateRandomVariables() {
    // All the Math.randoms are to choose a different starting point in each trial.
    this.isRow = (Math.random() < 0.5);
    this.p = [];
    if (this.isRow) {
      this.p = [util.randomInt(2, 3), util.randomInt(2, 7)];
    } else {
      this.p = [util.randomInt(2, 8), util.randomInt(2, 3)]; 
    }

    this.sourceFirst = (Math.random() < 0.5);
    this.sourceColors = shuffle(SOURCE_COLORS);
    // console.log("is row: " + String(this.isRow));
    // console.log('p: ' + String(this.p));
  }

  resetTrial() {
    this.container.removeChild(this.blocksContainer);
    this.canChangeTrial = false;
    document.getElementById("wrong-color-message").style.display = "none";
    document.getElementById("wrong-position-message").style.display = "none";
    document.getElementById("correct-message").style.display = "none";
    document.getElementById("early-release-message").style.display = "none";

    this.blocksContainer = new PIXI.Container();
    this.container.addChild(this.blocksContainer);

    this.sourceBlocks = [];
    this.targetBlocks = [];

    this.targetPositions = [];

    // Source blocks
    for (let i = 0; i < 3; i++) {
      var randomPoint = [];
      if (this.isRow) {
        randomPoint = (this.sourceFirst) ? [i, 0] : [i + this.p[0], this.p[1]];
      } else {
        randomPoint = (this.sourceFirst) ? [0, i] : [this.p[0], i + this.p[1]];
      }
      const pos = new PIXI.Point(randomPoint[0], randomPoint[1]);
      let rect = makeSourceShape(pos, this.sourceColors[i]);

      rect.buttonMode = true;
      rect.on("pointerdown", this.onPointerDown.bind(this))
      rect.on("pointerup", this.onPointerUp.bind(this))
      rect.on("pointermove", this.onPointerMove.bind(this))
      rect.interactive = true;
      var _self = this;
      rect.mouseover = function(mouseData) {
        _self.mouseOverBlock = rect;
      }

      this.sourceBlocks.push(pos);
      this.blocksContainer.addChild(rect);
    }

    // Target blocks
    for (let i = 0; i < 3; i++) {
      var randomPoint = [];
      if (this.isRow) {
        randomPoint = (!this.sourceFirst) ? [i, 0] : [i + this.p[0], this.p[1]];
      } else {
        randomPoint = (!this.sourceFirst) ? [0, i] : [this.p[0], i + this.p[1]];
      }

      // const p = [11, i - 4];
      const pos = new PIXI.Point(randomPoint[0], randomPoint[1]);
      let rect = makeTargetShape(pos);

      rect.interactive = false;

      this.targetBlocks.push(pos);
      this.blocksContainer.addChild(rect);
    }

    this.updateBlocks();
  }

  nextTrial() {
    if (this.currentTrial < this.numberTrials && this.canChangeTrial) {
      this.currentTrial += 1;
      this.generateRandomVariables();
      this.resetTrial();
      this.canChangeTrial = false;
    }
  }


  disableBlocksInteractivity() {
    for (let block of this.blocksContainer.children) {
      block.interactive = false;
    }
  }

  resetBlocks() {
    this.container.removeChild(this.blocksContainer);

    this.blocksContainer = new PIXI.Container();
    this.container.addChild(this.blocksContainer);
    this.blockGrid = [];
    for(let i = 0; i < 10; i++) {
      const gridPos = new PIXI.Point(i, 0);
      this.blockGrid.push(gridPos);

      let rect = makeSourceShape(gridPos);

      rect.buttonMode = true;
      rect.on("pointerdown", this.onPointerDown.bind(this))
      rect.on("pointerup", this.onPointerUp.bind(this))
      rect.on("pointermove", this.onPointerMove.bind(this))

      this.blocksContainer.addChild(rect);
    }

    this.updateBlocks();
    
  }

  removeBlocks() {
    this.container.removeChild(this.blocksContainer);
    this.blockGrid = [];
  }

  update(timeSinceStart) {
    if(this.timesUp) return;


    if(timeSinceStart > MAX_SEARCH_TIME) {
      this.timesUp = true;

      document.getElementById("add-shape").disabled = true;
      if(galleryShapes.length < 5) {
        document.getElementById("stuck-message").style.display = "block";
        document.getElementById("done-adding").disabled = true;
      } else {
        document.getElementById("continue-message").style.display = "block";
        document.getElementById("done-adding").disabled = false;
      }
    }

    // Animate highlighted blocks
    for(const block of this.highlightedBlocks) {
      const color = util.cyclicLerpColor(BLOCK_COLOR, HIGHLIGHTED_BLOCK_COLOR, 
        (timeSinceStart % DRAG_HIGHLIGHT_PERIOD) / DRAG_HIGHLIGHT_PERIOD);
      drawBlock(block, color);
    }

    if(util.distanceBetween(this.targetBlockContainerPosition, this.blocksContainer.position) > 1)
    {
      this.blocksContainer.position = util.lerp(this.blocksContainer.position, this.targetBlockContainerPosition, 0.5);
    }
  }

  teardown() {
    sceneLayer.removeChild(this.container);
    document.getElementById("blocks-gui").style.display = "none";

    document.getElementById("add-shape").removeEventListener("click", this.onAddShape);
    document.getElementById("done-adding").removeEventListener("click", this.onAttemptDone);
    document.getElementById("modal-confirm-cancel-button").removeEventListener("click", this.cancelModal);
    document.getElementById("modal-confirm-done-button").removeEventListener("click", this.confirmDone);
  }

  requestedTransition(timeSinceStart) { return this.done ? "next" : null; }

  highlightMovableBlocks() {
    for(const blockGraphic of this.blocksContainer.children) {
      if(this.canMoveBlock(pixelPosToGridPos(blockGraphic.position))) {
        this.highlightedBlocks.add(blockGraphic);
      }
    }
  }

  unhighlightMovableBlocks() {
    for(const blockGraphic of this.blocksContainer.children) {
      if(this.canMoveBlock(pixelPosToGridPos(blockGraphic.position))) {
        this.unhighlightBlock(blockGraphic);
      }
    }
  }

  unhighlightBlock(blockGraphic) {
    this.highlightedBlocks.delete(blockGraphic);
    drawBlock(blockGraphic, BLOCK_COLOR);
  }

  onPointerDown(e) {
    console.log("Hellii tis iksfa");
    if(this.draggingBlock) return; // Don't allow multiple drags
    if(this.timesUp) return; // Don't allow drags when time is up

    console.log(e);

    this.draggingBlock = e.currentTarget;
    
    this.draggingPointerId = e.data.pointerId; // Keep track of which finger is used 
    this.draggingBlockStartGridPosition = pixelPosToGridPos(this.draggingBlock.position);
    this.startDragTime = Date.now();
    
    const blockColor = this.draggingBlock.graphicsData[0].fillColor;
    if (blockColor != parseInt(String(TARGET_COLOR))) {
      //TODO You have some cleaning up to do.
      // alert("You chose the wrong color!");
      document.getElementById("wrong-color-message").style.display = "block";
      this.draggingBlock = null;
      this.disableBlocksInteractivity();
      return;
    }
    
    // Reorder so this block is on top
    // this.blocksContainer.setChildIndex(this.draggingBlock, this.blocksContainer.children.length - 1);
    this.blocksContainer.setChildIndex(this.draggingBlock, this.blocksContainer.children.length - 1);


    const gridPos = pixelPosToGridPos(this.draggingBlock.position);
    this.sourceBlocks = util.removeFromArray(this.sourceBlocks, gridPos);
    this.canChangeTrial = true;

    // this.highlightedBlocks.add(this.draggingBlock);

    // Disable html buttons
    document.getElementById("html-layer").className = "no-pointer-events";
  }

  onPointerUp(e) {
    if(!this.draggingBlock) return;

    this.dropBlock(this.draggingBlock, this.draggingBlock.position);

    // this.unhighlightBlock(this.draggingBlock);

    this.draggingBlock = null;
    this.draggingPointerId = null;
    this.updateBlocks();

    document.getElementById("add-shape").disabled = false;
    this.changedShape = true;

    // Re-enable html buttons
    document.getElementById("html-layer").className = "";

    this.emit("droppedBlock");
  }

  onPointerMove(e) {
    if(!this.draggingBlock) return;
    // if(e.data.pointerId !== this.draggingPointerId) return;


    this.draggingBlock.position = util.subtract(e.data.getLocalPosition(app.stage), this.blocksContainer.position);
  }

  onKeyUp(e) {
    // If they pressed a number key, add the shape
    if (!isNaN(parseInt(e.key))) {
      var keyValue = parseInt(e.key);
      if (keyValue == 1) {
        this.nextTrial();
      } else if (keyValue == 2) {
        this.resetTrial();
      } else if (keyValue == 3) {
        // canvas.addEventListener('pointerdown', this.onPointerDown);
        // document.dispatchEvent(new PointerEvent('pointerdown'));
        // const gridPos = pixelPosToGridPos([this.mouseX, this.mouseY]);
        // console.log(String(this.mouseX) + ", " + String(this.mouseY));
        // console.log(gridPos);
        const mouseEvent = new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true, 
        });
        // app.view.dispatchEvent(mouseEvent);
        // document.getElementById('pixi-canvas').dispatchEvent(mouseEvent);
        // this.mouseOverBlock.emit("pointerdown");
        // app.renderer.plugins.interaction.emit(mouseEvent);
        this.draggingBlock = this.mouseOverBlock;
        this.blocksContainer.setChildIndex(this.draggingBlock, this.blocksContainer.children.length - 1);
        const gridPos = pixelPosToGridPos(this.draggingBlock.position);
        this.sourceBlocks = util.removeFromArray(this.sourceBlocks, gridPos);
        this.canChangeTrial = true;
        console.log(this.draggingBlock);
      } else if (keyValue == 4) {
        this.dropBlock(this.draggingBlock, this.draggingBlock.position);

        // this.unhighlightBlock(this.draggingBlock);
    
        this.draggingBlock = null;
        this.draggingPointerId = null;
        this.updateBlocks();
    
        document.getElementById("add-shape").disabled = false;
        this.changedShape = true;
    
        // Re-enable html buttons
        document.getElementById("html-layer").className = "";
    
        this.emit("droppedBlock");
      }
    }
  }

  onMouseMove(e) {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    // console.log(String(this.mouseX) + ", " + String(this.mouseY));
  }

  updateBlocks() {
    this.updateTargetBlockContainerPosition();
    this.updateBlockInteractivity();
  }

  updateTargetBlockContainerPosition() {
    const centerPos = new PIXI.Point(app.view.width / 2, app.view.height / 2);
    const oldBlockPositions = this.blocksContainer.children.map(c => c.position);
    const minBlockPos = util.min.apply(null, oldBlockPositions);
    const maxBlockPos = util.max.apply(null, oldBlockPositions);
    const blockCenterPos = util.average(minBlockPos, maxBlockPos);
    this.targetBlockContainerPosition = util.subtract(centerPos, blockCenterPos);
  }

  updateBlockInteractivity() {
    for(const blockGraphic of this.blocksContainer.children) {
      // if(this.canMoveBlock(pixelPosToGridPos(blockGraphic.position))) {
      //   blockGraphic.interactive = true;
      // } else {
      //   blockGraphic.interactive = false;
      // }
      // blockGraphic.interactive = true;
      return 
    }
  }

  dropBlock(block, droppedPos) {
    // Find closest grid position
    const droppedGridPos = pixelPosToGridPos(droppedPos);

    const freeGridPositionsSource = this.findFreeGridPositionsSource();
    const closestSourcePos = _.min(freeGridPositionsSource, freePos => util.distance(droppedGridPos, freePos));
    
    const freeGridPositionsTarget = this.findFreeGridPositionsTarget();
    const closestTargetPos = _.min(freeGridPositionsTarget, freePos => util.distance(droppedGridPos, freePos));
    // Check if it is closer to the target, closer to who?
    const distanceToTarget = util.distance(droppedGridPos, closestTargetPos);
    const distanceToSource = util.distance(droppedGridPos, closestSourcePos);

    const closerToTarget = distanceToTarget < distanceToSource;
    
    // This means the user has to drop in the area of one block around the target.
    const BOUNDARY_LIMIT = 1;
    
    //TODO remove

    if (closerToTarget && (distanceToTarget <= BOUNDARY_LIMIT)) {
      // Check if it is in the boundary of the target or if it is far.
      // If closer to the target and within the boundary, attach it to the closest box.
      // If closer to the target but not in the allowed boundary, attach it to the source
      
      block.position = gridPosToPixelPos(closestTargetPos);
      
      if (!util.contains(this.targetPositions, closestTargetPos)) {
        // alert("wrong position");
        document.getElementById("wrong-position-message").style.display = "block";
      } else {
        document.getElementById("correct-message").style.display = "block";
      }
      // this.targetBlocks.push(closestTargetPos);
    } else {
      // If closer to the source, attach it to the source. 
      block.position = gridPosToPixelPos(closestSourcePos);
      document.getElementById("early-release-message").style.display = "block";
      // this.sourceBlocks.push(closestSourcePos);
      // this.targetBlocks.push(closestTargetPos);
    }
    this.disableBlocksInteractivity();


    // block.position = gridPosToPixelPos(closestSourcePos);
    // this.blockGrid.push(closestSourcePos);

    this.lastMouseUpTime = Date.now();
    //TODO Add this to database!

    // redmetricsConnection.postEvent({
    //   type: "movedBlock",
    //   customData: {
    //     startPosition: pointToArray(this.draggingBlockStartGridPosition),
    //     endPosition: pointToArray(closestSourcePos),
    //     time: Date.now() - this.startDragTime,
    //     newShape: convertShapeToArray(this.blockGrid)
    //   }
    // });
  }

  findFreeGridPositionsSource() {
    var ret = [];
    for(let b of this.sourceBlocks) {
      ret.push(new PIXI.Point(b.x - 1, b.y));
      ret.push(new PIXI.Point(b.x + 1, b.y));
      ret.push(new PIXI.Point(b.x, b.y - 1));
      ret.push(new PIXI.Point(b.x, b.y + 1));
    }
    ret = util.uniq(ret);
    return util.difference(ret, this.sourceBlocks);
  }

  findFreeGridPositionsTarget() {
    var ret = [];
    var i = 0;
    this.targetPositions = [];
    for(let b of this.targetBlocks) {
      ret.push(new PIXI.Point(b.x - 1, b.y));
      ret.push(new PIXI.Point(b.x + 1, b.y));
      ret.push(new PIXI.Point(b.x, b.y - 1));
      ret.push(new PIXI.Point(b.x, b.y + 1));

      if (i == 0) {
        if (this.isRow) {
          this.targetPositions.push(new PIXI.Point(b.x - 1, b.y));
        } else {
          this.targetPositions.push(new PIXI.Point(b.x, b.y - 1));
        }
      } else if (i == 2) {
        if (this.isRow) {
          this.targetPositions.push(new PIXI.Point(b.x + 1, b.y));
        } else {
          this.targetPositions.push(new PIXI.Point(b.x, b.y + 1));
        }
      }
      i++;
    }
    ret = util.uniq(ret);
    return util.difference(ret, this.targetBlocks);
  }



  blocksAreNeighbors(a, b) {
    const x = Math.abs(a.x - b.x); 
    const y = Math.abs(a.y - b.y); 
    return x == 1 && y == 0 || x == 0 && y == 1; 
  }

  makeAdjacencyList(blocks) {
    let adjList = _.map(blocks, function () {
      return [];
    });
    for (let i = 0; i < blocks.length - 1; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        if (this.blocksAreNeighbors(blocks[i], blocks[j])) {
            adjList[i].push(j);
            adjList[j].push(i);
        }
      }
    }
    return adjList;
  }

  visitBlocks(adjList, startingIndices) {
    let visited = [startingIndices];
    while (true) {
      let toVisit = _.reduce(visited[visited.length - 1], function (memo, visitingIndex) {
        return memo.concat(adjList[visitingIndex]);
      }, []);
      toVisit = _.uniq(toVisit);
      toVisit = _.difference.apply(_, [toVisit].concat(visited));
      if (toVisit.length > 0) {
        visited.push(toVisit);
      } else {
        return visited;
      }
    }
  }

  canMoveBlock(gridPos) {
    let blocksWithout = util.removeFromArray(this.blockGrid, gridPos);
    let adjList = this.makeAdjacencyList(blocksWithout);
    let visited = this.visitBlocks(adjList, [0]);
    return _.flatten(visited).length == blocksWithout.length;
  }

  onAddShape() {
    if(this.preventAddingShape) return;
    if(this.timesUp) return; // Don't allow adding shape when time is up
    if(!this.changedShape) return;
    if(this.draggingBlock) return; // Can't add shape while dragging

    sendTrigger("collectShape");

    const galleryShape = util.cloneData(this.blockGrid)
    galleryShapes.push(galleryShape);
    this.updateGalleryShape(galleryShape);

    document.getElementById("end-early-message").style.display = "none";
    document.getElementById("add-shape").disabled = true;
    this.changedShape = false;

    // redmetricsConnection.postEvent({
    //   type: "added shape to gallery",
    //   customData: {
    //     shape: convertShapeToArray(this.blockGrid),
    //     timeSinceLastMouseUp: Date.now() - this.lastMouseUpTime
    //   }
    // });

    this.emit("addedShape");
  }

  onAttemptDone() {
    if(this.timesUp || !allowEarlyExit) {
      this.confirmDone();
    } else if(galleryShapes.length < 5) { 
      document.getElementById("end-early-message").style.display = "block";
    } else {
      document.getElementById("modal-confirm-done").style.display = "block";
    }
  }

  cancelModal() {
    document.getElementById("modal-confirm-done").style.display = "none";
  }

  confirmDone() {
    sendTrigger("endGame");

    this.done = true;

    searchScore = calculateSearchScore()
  }

  updateGalleryShape(galleryShape) {
    this.galleryLayer.removeChildren();
    for(let block of galleryShape)
      this.galleryLayer.addChild(makeSourceShape(block));
    util.centerContainer(this.galleryLayer, new PIXI.Point());
  }
}

class GalleryScene extends util.Entity {
  setup() {
    const ROWS = 5;
    const COLS = 10;
    const ITEMS_PER_PAGE = ROWS * COLS

    this.done = false;
    this.selectedIndexes = [];
    this.pageNumber = 0;

    this.container = new PIXI.Container();
    sceneLayer.addChild(this.container);

    this.pages = new PIXI.Container();
    this.container.addChild(this.pages);

    let pageContainer;
    for(let i = 0; i < galleryShapes.length; i++) {
      const page = Math.floor(i / ITEMS_PER_PAGE);
      const row = Math.floor((i % ITEMS_PER_PAGE) / COLS); 
      const col = Math.floor((i % ITEMS_PER_PAGE) % COLS);

      // Make new page if necessary
      if(i % (ROWS * COLS) == 0) {
        pageContainer = new PIXI.Container();
        pageContainer.visible = false;
        this.pages.addChild(pageContainer);
      }
      const galleryShapeCenter = new PIXI.Point(70 + col * 90, 95 + row * 85);

      const galleryBg = new PIXI.Graphics();
      galleryBg.beginFill(0x333333);
      galleryBg.drawRect(-40, -40, 80, 80);
      galleryBg.endFill();
      galleryBg.position = galleryShapeCenter;
      pageContainer.addChild(galleryBg);

      galleryBg.on("pointerdown", e => this.onToggleShape(galleryBg, i));
      galleryBg.buttonMode = true;
      galleryBg.interactive = true;

      const galleryParent = new PIXI.Container();
      galleryParent.position = galleryShapeCenter;
      galleryParent.scale.set(0.1);
      pageContainer.addChild(galleryParent);

      const galleryLayer = new PIXI.Container();
      for(let block of galleryShapes[i])
        galleryLayer.addChild(makeSourceShape(block));
      util.centerContainer(galleryLayer, new PIXI.Point());
      galleryParent.addChild(galleryLayer);
    }

    // HTML
    document.getElementById("selection-gui").style.display = "block";
    document.getElementById("done-selection").addEventListener("click", this.onDoneSelection.bind(this));
    document.getElementById("previous-page-button").addEventListener("click", e => this.changePage(this.pageNumber - 1));
    document.getElementById("next-page-button").addEventListener("click", e => this.changePage(this.pageNumber + 1));

    this.updateDoneButton();

    this.changePage(0);
  }

  update(timeSinceStart) {
    if(this.done) searchScore = calculateSearchScore(galleryShapes.length, timeSinceStart);
  } 

  teardown() {
    sceneLayer.removeChild(this.container);
    document.getElementById("selection-gui").style.display = "none";
  }
  
  requestedTransition(timeSinceStart) { return this.done ? "next" : null; }

  onToggleShape(shape, shapeIndex) {
    const isSelected = !_.contains(this.selectedIndexes, shapeIndex);

    if(isSelected) this.selectedIndexes.push(shapeIndex);
    else this.selectedIndexes = util.removeFromArray(this.selectedIndexes, shapeIndex); 
    
    shape.beginFill(isSelected ? 0x9B2526 : 0x333333);
    shape.drawRect(-40, -40, 80, 80);
    shape.endFill();

    this.updateDoneButton();

    sendTrigger("chooseGalleryShape");

    // redmetricsConnection.postEvent({
    //   type: "selected shape",
    //   customData: {
    //     shapeIndex: shapeIndex,
    //     shape: convertShapeToArray(galleryShapes[shapeIndex]),
    //     isSelected: isSelected,
    //   }
    // });
  }

  updateDoneButton() {
    document.getElementById("done-selection").disabled = this.selectedIndexes.length != 5;
  }

  changePage(newPageNumber) {
    this.pages.children[this.pageNumber].visible = false;

    this.pageNumber = newPageNumber;
    this.pages.children[this.pageNumber].visible = true;
    document.getElementById("previous-page-button").disabled = this.pageNumber == 0;
    document.getElementById("next-page-button").disabled = this.pageNumber == (this.pages.children.length - 1);
  }

  onDoneSelection() {
    const selectedShapes = _.map(this.selectedIndexes, index => convertShapeToArray(galleryShapes[index]));

    sendTrigger("galleryDone");

    // redmetricsConnection.postEvent({
    //   type: "done selection",
    //   customData: {
    //     shapeIndices: this.selectedIndexes,
    //     shapes: selectedShapes
    //   }
    // });

    this.done = true;
  }
}


class ResultsScene extends util.Entity {
  setup() {
    this.container = new PIXI.Container();
    sceneLayer.addChild(this.container);

    document.getElementById("results-gui").style.display = "block";

    if(!showResults) {
      document.getElementById("results-block").style.display = "none";
    } else {
      document.getElementById("thanks-block").style.display = "none";

      const slider = new PIXI.Sprite(app.loader.resources["images/slider.png"].texture);
      slider.anchor.set(0.5);
      slider.position.set(app.renderer.width / 2, 145);
      this.container.addChild(slider);

      const ball = new PIXI.Graphics();
      ball.beginFill(0x2CC62C);
      ball.drawCircle(app.renderer.width / 2 + searchScore * 255, 120, 10);
      this.container.addChild(ball);

      if(searchScore > 0) {
        document.getElementById("rapid-search-text").style.display = "block";
      } else {
        document.getElementById("focused-search-text").style.display = "block";
      }

      const searchScorePercent = Math.round(Math.abs(searchScore) * 100);
      for(let el of document.getElementsByClassName("searchScorePercent")) {
        el.innerText = searchScorePercent;
      }

      // document.getElementById("code").innerText = redmetricsConnection.playerId ? 
        // redmetricsConnection.playerId.substr(-8) : "Unknown";

      // Setup followup link
      if(searchParams.has("followupLink")) {
        const expId = searchParams.get("expId") || searchParams.get("expID") || "";
        const userId = searchParams.get("userId") || searchParams.get("userID") || "";
        const metricsId = redmetricsConnection.playerId || "";
        const userProvidedId = playerData.customData.userProvidedId || "";

        var link = searchParams.get("followupLink");
        if(!_.contains(link, "?")) link += "?";
        link += "&IDExp=" + expId 
          + "&IDUser=" + userId
          + "&IDMetrics=" + metricsId
          + "&IDUserProvided=" + userProvidedId;
        document.getElementById("followup-link").href = link;
      } else {
        document.getElementById("followup-link-container").style.display = "none";
      }
    }
  }

  teardown() {
    document.getElementById("results-gui").style.display = "none";
    sceneLayer.removeChild(this.container);
  }  
}


const scenes = {
  intro: IntroScene,
  training: TrainingScene,
  block: BlockScene,
  gallery: GalleryScene,
  results: ResultsScene
};

const sceneTransitions = {
  intro: "training",
  training: "block",
  block: "gallery",
  gallery: "results",
};

const metricsStartSceneEvents = {
  intro: "startIntro",
  training: "startTutorial",
  block: "startSearch",
  gallery: "end search",
  results: "startFeedback"
};

const searchParams = new URLSearchParams(window.location.search);
const allowEarlyExit = searchParams.get("allowEarlyExit") !== "false" && searchParams.get("allowEarlyExit") !== "0";
const showResults = searchParams.get("showResults") !== "false" && searchParams.get("showResults") !== "0";
const numTrials = (searchParams.get("trials")) ? parseInt(searchParams.get("trials")) : 30;
console.log(searchParams.get("trials"));
console.log(numTrials); 
let galleryShapes = [];
let searchScore = 0.33;
let redmetricsConnection;
const defaultStartingScene = "block";
let sceneLayer;
let currentScene;
let currentSceneName;
let sceneStartedAt = 0;

const app = new PIXI.Application({
  width: 960,
  height: 540,
  view: document.getElementById("pixi-canvas"),
  antialias: true
});

app.loader
  .add(["images/slider.png"])
  .on("progress", loadProgressHandler)
  .load(setup);

// Load RedMetrics
function showRedMetricsStatus(status) {
  for(const child of document.getElementById("redmetrics-connection-status").children) {
    const shouldShow = child.id === `redmetrics-connection-status-${status}`;
    child.style.display = shouldShow ? "block" : "none";
  }
}

let playerData = {
  externalId: searchParams.get("userId") || searchParams.get("userID"),
  customData: {
    expId: searchParams.get("expId") || searchParams.get("expID"),
    userId: searchParams.get("userId") || searchParams.get("userID"),
    userAgent: navigator.userAgent
  }
};

// redmetricsConnection = redmetrics.prepareWriteConnection({ 
//   host: RED_METRICS_HOST,
//   gameVersionId: searchParams.get("gameVersion") || RED_METRICS_GAME_VERSION,
//   player: playerData
// });
// redmetricsConnection.connect().then(function() {
//   console.log("Connected to the RedMetrics server");
//   showRedMetricsStatus("connected");
// }).catch(function() {
//   showRedMetricsStatus("disconnected");
// });

// Connect to parallel port via Mister P
let webSocketScheme = window.location.protocol === "https:" ? "wss" : "ws"; 
let ws = new WebSocket(`${webSocketScheme}://localhost:53141/`);
ws.onopen = () => {
  console.log("Connected to Mister P on port 53141");
  sendTrigger("loadGame");
};
ws.onerror = (error) => {
  console.error("Error communicating on WebSocket", error);
};

// Resize
util.resizeGame(app);
window.addEventListener("resize", () => util.resizeGame(app));

// // Debugging code
// for(let i = 0; i < 120; i++) {
//   galleryShapes.push([{"x":1,"y":0},{"x":2,"y":0},{"x":3,"y":0},{"x":4,"y":0},{"x":5,"y":0},{"x":6,"y":0},{"x":7,"y":0},{"x":8,"y":0},{"x":9,"y":0},{"x":1,"y":-1}]);
// }

