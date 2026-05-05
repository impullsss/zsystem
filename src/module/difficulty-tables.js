export const Z_DIFFICULTY = {
    chance: {
        min: 0,
        max: 95,
        blocked: -1000
    },
    calledShot: {
        torso: 0,
        head: -40,
        lArm: -20,
        rArm: -20,
        lLeg: -20,
        rLeg: -20
    },
    cover: {
        none: 0,
        window: -20,
        light: -15,
        heavy: -30,
        blocked: -1000
    },
    range: {
        near: 0,
        medium: -20,
        far: -40
    },
    interference: {
        perToken: -20,
        cap: -40
    },
    visibility: {
        clear: 0,
        dim: -15,
        dark: -30,
        blocked: -1000
    },
    social: {
        attitude: {
            friendly: 10,
            neutral: 0,
            hostile: -20
        },
        preset: {
            easy: 10,
            normal: 0,
            hard: -10
        }
    }
};

export function getCalledShotPenalty(location = "torso") {
    return Z_DIFFICULTY.calledShot[location] ?? Z_DIFFICULTY.calledShot.torso;
}

export function getCoverPenalty(cover = "none") {
    return Z_DIFFICULTY.cover[cover] ?? Z_DIFFICULTY.cover.none;
}

export function getRangePenalty(rangeBand = "near") {
    return Z_DIFFICULTY.range[rangeBand] ?? Z_DIFFICULTY.range.near;
}

export function getVisibilityPenalty(visibility = "clear") {
    return Z_DIFFICULTY.visibility[visibility] ?? Z_DIFFICULTY.visibility.clear;
}

export function getInterferencePenalty(count = 0) {
    const obstacles = Math.max(0, Number(count) || 0);
    return Math.max(
        obstacles * Z_DIFFICULTY.interference.perToken,
        Z_DIFFICULTY.interference.cap
    );
}

export function clampChance(value) {
    return Math.max(Z_DIFFICULTY.chance.min, Math.min(Z_DIFFICULTY.chance.max, value));
}
