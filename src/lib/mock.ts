/** Mock data for GEMINI_MOCK=1 development. */

export const MOCK_TRANSCRIPT = `Lecturer: Good morning everyone. Today we are
covering the foundations of neural networks. A neural network is a stack of
learned linear maps separated by non-linear activation functions. The
simplest unit is the perceptron. It takes inputs, multiplies by weights,
adds a bias, and applies an activation function.
Student: Is an epoch one update or one pass through the data?
Lecturer: One complete pass through the training set. For next week:
derive the sigmoid gradient, and train a perceptron on the Iris subset.
This will be on the midterm.`

export const MOCK_SYNTHESIS = {
  lectureTitle: 'Introduction to Neural Networks',
  summary:
    'This lecture introduced artificial neural networks as stacks of learned linear maps separated by non-linear activations. It covered the perceptron, why non-linearities are essential, and outlined training via gradient descent.',
  keyTakeaways: [
    'A neural network is a stack of learned linear maps with non-linear activations between them',
    'The perceptron is the simplest neural unit: weighted inputs plus bias, passed through an activation function',
    'Non-linearity is essential — without it, stacked layers collapse to a single linear map',
    'Training uses gradient descent and backpropagation',
  ],
  topics: [
    {
      title: 'The Perceptron',
      summary:
        'The perceptron is the simplest neural unit. It multiplies inputs by weights, adds a bias, and applies an activation function.',
      concepts: [
        {
          term: 'Perceptron',
          definition:
            'The simplest neural unit: takes weighted inputs, adds a bias, applies an activation function. It is the building block of larger networks.',
        },
      ],
      examples: [
        'Given inputs x1=0.5, x2=0.8 with weights w1=0.3, w2=0.7 and bias b=0.1: output = activation(0.5*0.3 + 0.8*0.7 + 0.1) = activation(0.82)',
      ],
      processes: [
        {
          name: 'Forward pass through a perceptron',
          steps: [
            'Multiply each input by its weight',
            'Sum the weighted inputs',
            'Add the bias',
            'Apply the activation function',
          ],
        },
      ],
      warnings: [
        {
          issue: 'Forgetting the bias',
          advice:
            'The bias shifts the decision boundary — without it the perceptron can only learn boundaries through the origin.',
        },
      ],
      terminology: [
        {
          term: 'Activation function',
          meaning:
            'A non-linear function applied to the weighted sum, e.g. sigmoid, ReLU. It enables the network to learn non-linear patterns.',
        },
      ],
    },
  ],
  assignments: [
    { description: 'Derive the sigmoid gradient and train a perceptron on the Iris subset' },
  ],
  examHints: ['This material will be on the midterm'],
  crossTopicRelationships: [
    {
      from: 'Perceptron',
      to: 'Gradient Descent',
      relation: "The perceptron's weights are updated using gradient descent during training.",
    },
  ],
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function mockTranscribe(): Promise<string> {
  await delay(300)
  return MOCK_TRANSCRIPT
}

export async function mockSynthesize(): Promise<Record<string, unknown>> {
  await delay(400)
  return structuredClone(MOCK_SYNTHESIS)
}
