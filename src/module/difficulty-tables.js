export const Z_DIFFICULTY = {
    chance: {
        min: 0,
        max: 95,
        blocked: -1000
    },
    calledShot: {
        torso: 0,
        head: -20,
        lArm: -20,
        rArm: -20,
        lLeg: -20,
        rLeg: -20
    },
    cover: {
        none: 0,
        window: -20,
        light: -10,
        heavy: -30,
        blocked: -1000
    },
    range: {
        near: 0,
        medium: -10,
        far: -40
    },
    interference: {
        perToken: -20,
        cap: -40
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

export function clampChance(value) {
    return Math.max(Z_DIFFICULTY.chance.min, Math.min(Z_DIFFICULTY.chance.max, value));
}
