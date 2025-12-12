const Bot = require("./Bot");
const fs = require('fs');

class PlayerBot extends Bot {
    /**
     * @param {World} world
     * @param {string} [name] - Nombre opcional
     * @param {string} [skin] - Skin opcional
     */
    constructor(world, name, skin) {
        super(world);

        this.splitCooldownTicks = 0;
        /** @type {Cell} */
        this.target = null;
        this.lastMoveDirection = { x: 0, y: 0 };

        this.botName = name || "";
        this.botSkin = skin || "";
        this.hasSetSkin = false;
    }

    static get type() { return "playerbot"; }
    static get separateInTeams() { return true; }

    get shouldClose() {
        return !this.hasPlayer
            || !this.player.exists
            || !this.player.hasWorld;
    }

    update() {
        if (this.splitCooldownTicks > 0) this.splitCooldownTicks--;
        else this.target = null;

        this.player.updateVisibleCells();
        const player = this.player;

        if (player.state === -1) {
            const names = this.listener.settings.worldPlayerBotNames;
            const skins = this.listener.settings.worldPlayerBotSkins;

            let randomSkin = "";
            let randomName = "";

            if (this.botSkin) {
                randomSkin = this.botSkin;
            } else {
                randomSkin = skins[~~(Math.random() * skins.length)] || "";
            }

            if (this.botName) {
                randomName = this.botName;
            } else {
                randomName = names[~~(Math.random() * names.length)] || "Player bot";
            }

            this.spawningName = randomName;

            if (this.player) {
                this.player.cellSkin = randomSkin;
                this.player.leaderboardName = randomName;
            }

            this.onSpawnRequest();
            this.spawningName = null;
            this.hasSetSkin = true; 

        } 

        else if (player.state === 0 && !this.hasSetSkin && this.player) {
            const skins = this.listener.settings.worldPlayerBotSkins;
            const randomSkin = skins[~~(Math.random() * skins.length)] || "";

            this.player.cellSkin = randomSkin;
            this.hasSetSkin = true;
        }

        /** @type {PlayerCell} */
        let cell = null;
        for (let i = 0, l = player.ownedCells.length; i < l; i++)
            if (cell === null || player.ownedCells[i].size > cell.size)
                cell = player.ownedCells[i];
        if (cell === null) return;

        if (this.target != null) {
            if (!this.target.exists || !this.canEat(cell.size, this.target.size))
                this.target = null;
            else {
                this.mouseX = this.target.x;
                this.mouseY = this.target.y;
                return;
            }
        }

        const atMaxCells = player.ownedCells.length >= this.listener.settings.playerMaxCells;
        const willingToSplit = player.ownedCells.length <= 2;
        const cellCount = Object.keys(player.visibleCells).length;

        let mouseX = 0;
        let mouseY = 0;
        let bestPrey = null;
        let splitkillObstacleNearby = false;

        for (let id in player.visibleCells) {
            const check = player.visibleCells[id];
            const truncatedInfluence = Math.log10(cell.squareSize);
            let dx = check.x - cell.x;
            let dy = check.y - cell.y;
            let dSplit = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            let d = Math.max(1, dSplit - cell.size - check.size);
            let influence = 0;
            switch (check.type) {
                case 0:
                    if (player.id === check.owner.id) break;
                    if (player.team !== null && player.team === check.owner.team) break;
                    if (this.canEat(cell.size, check.size)) {
                        influence = truncatedInfluence;
                        if (!this.canSplitkill(cell.size, check.size, dSplit)) break;
                        if (bestPrey === null || check.size > bestPrey.size)
                            bestPrey = check;
                    } else {
                        influence = this.canEat(check.size, cell.size) ? -truncatedInfluence * cellCount : -1;
                        splitkillObstacleNearby = true;
                    }
                    break;
                case 1: influence = 1; break;
                case 2:
                    if (atMaxCells) influence = truncatedInfluence;
                    else if (this.canEat(cell.size, check.size)) {
                        influence = -1 * cellCount;
                        if (this.canSplitkill(cell.size, check.size, dSplit))
                            splitkillObstacleNearby = true;
                    }
                    break;
                case 3: if (this.canEat(cell.size, check.size)) influence = truncatedInfluence * cellCount; break;
                case 4:
                    if (this.canEat(check.size, cell.size)) influence = -1;
                    else if (this.canEat(cell.size, check.size)) {
                        if (atMaxCells) influence = truncatedInfluence * cellCount;
                        else influence = -1;
                    }
                    break;
            }

            if (influence === 0) continue;
            if (d === 0) d = 1;
            dx /= d; dy /= d;
            mouseX += dx * influence / d;
            mouseY += dy * influence / d;
        }

        if (
            willingToSplit && !splitkillObstacleNearby && this.splitCooldownTicks <= 0 &&
            bestPrey !== null && bestPrey.size * 2 > cell.size
        ) {
            this.target = bestPrey;
            this.mouseX = bestPrey.x;
            this.mouseY = bestPrey.y;
            this.splitAttempts++;
            this.splitCooldownTicks = 15;
        } else {
            if (mouseX === 0 && mouseY === 0) {
                this.lastMoveDirection.x = Math.random() * 2 - 1;
                this.lastMoveDirection.y = Math.random() * 2 - 1;
                mouseX = this.lastMoveDirection.x;
                mouseY = this.lastMoveDirection.y;
            }

            const d = Math.max(1, Math.sqrt(mouseX * mouseX + mouseY * mouseY));
            this.mouseX = cell.x + mouseX / d * player.viewArea.w;
            this.mouseY = cell.y + mouseY / d * player.viewArea.h;
        }
    }

    /**
     * @param {number} aSize
     * @param {number} bSize
     */
    canEat(aSize, bSize) {
        return aSize > bSize * this.listener.settings.worldEatMult;
    }

    /**
     * @param {number} aSize
     * @param {number} bSize
     * @param {number} d
     */
    canSplitkill(aSize, bSize, d) {
        const splitDistance = Math.max(
            2 * aSize / this.listener.settings.playerSplitSizeDiv / 2,
            this.listener.settings.playerSplitBoost
        );
        return aSize / this.listener.settings.playerSplitSizeDiv > bSize * this.listener.settings.worldEatMult &&
               d - splitDistance <= aSize - bSize / this.listener.settings.worldEatOverlapDiv;
    }
}

module.exports = PlayerBot;

const World = require("../worlds/World");
const Cell = require("../cells/Cell");
const PlayerCell = require("../cells/PlayerCell");
