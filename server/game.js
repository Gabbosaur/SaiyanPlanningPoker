'use strict';

const cardDecks = {
    fibonacci: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, '?'],
    modifiedFibonacci: [0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100, '?'],
    tshirt: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?']
};

/**
 * Returns the most frequent numeric vote, ignoring '?'.
 */
function calculateMode(votes) {
    const frequency = {};
    let maxFreq = 0;
    let mode = null;

    votes.forEach((vote) => {
        if (vote !== '?') {
            frequency[vote] = (frequency[vote] || 0) + 1;
            if (frequency[vote] > maxFreq) {
                maxFreq = frequency[vote];
                mode = vote;
            }
        }
    });

    return mode;
}

function calculateAverage(votes) {
    const numericVotes = votes.filter((vote) => vote !== '?').map(Number);
    if (numericVotes.length === 0) return null;

    const sum = numericVotes.reduce((acc, val) => acc + val, 0);
    return (sum / numericVotes.length).toFixed(2);
}

function checkConsensus(votes) {
    const validVotes = votes.filter((vote) => vote !== '?');
    if (validVotes.length === 0) return false;

    const firstVote = validVotes[0];
    return validVotes.every((vote) => vote === firstVote);
}

/**
 * Computes mode, average and consensus flag from a list of vote values.
 * Used when all players have voted.
 */
function calculateResults(votes) {
    if (votes.length === 0) {
        return { mode: '-', average: '-', consensus: false };
    }

    const frequency = {};
    votes.forEach((vote) => {
        frequency[vote] = (frequency[vote] || 0) + 1;
    });

    const mode = Object.keys(frequency).reduce((a, b) =>
        frequency[a] > frequency[b] ? a : b
    );

    const numericVotes = votes.filter((vote) => !Number.isNaN(Number(vote))).map(Number);
    const average = numericVotes.length > 0
        ? (numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length).toFixed(1)
        : '-';

    const consensus = frequency[mode] === votes.length;

    return { mode, average, consensus };
}

module.exports = {
    cardDecks,
    calculateMode,
    calculateAverage,
    checkConsensus,
    calculateResults
};
