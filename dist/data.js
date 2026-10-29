const COMMANDS = {
  Explain: { short: "Give a reason", detail: "Connect what happens to why it happens. Use a clear scientific or mathematical reason, then link it to the question.", prompt: "What happens \u2014 and why?", starter: "This happens because\u2026" },
  Describe: { short: "Say what happens", detail: "State the relevant features, changes or steps precisely. Give direction, size or sequence when the question needs it.", prompt: "What would you observe or do?", starter: "The change is\u2026" },
  Calculate: { short: "Show the working", detail: "Choose the relationship, substitute the values, and give a numerical answer with an appropriate unit where needed.", prompt: "Relationship \u2192 substitution \u2192 answer", starter: "Write the relationship first." },
  Compare: { short: "Link both things", detail: "Make direct statements about both things. Include similarities and differences when asked; use \u201Cboth\u201D and \u201Cwhereas\u201D to make the link clear.", prompt: "What is the same? What is different?", starter: "Both\u2026 whereas\u2026" }
};
const ACTIVITIES = [
  {
    id: "heat-transfer",
    subject: "Physics",
    command: "Explain",
    topic: "heat transfer",
    topics: ["heat transfer", "air pressure", "electrical resistance"],
    question: "Explain why trapped air reduces heat transfer through a wall.",
    hint: "Link a property of trapped air to the rate of energy transfer.",
    placeholder: "Trapped air reduces heat transfer because\u2026",
    model: "Air is a poor thermal conductor, so a trapped layer reduces energy transfer by conduction through the wall. Keeping the air trapped also limits convection.",
    criteria: ["I identified trapped air as a poor thermal conductor (or said it limits convection).", "I linked that property to slower energy transfer through the wall."],
    trap: "\u201CIt insulates the wall\u201D repeats the idea. Explain how the trapped air reduces energy transfer."
  },
  {
    id: "gradient",
    subject: "Maths",
    command: "Calculate",
    topic: "gradient",
    topics: ["area", "gradient", "probability"],
    question: "Calculate the gradient of a straight line through (1, 3) and (5, 11).",
    hint: "Find the change in y and divide by the change in x.",
    placeholder: "Gradient = change in y \xF7 change in x\nSubstitute the coordinates\u2026",
    expected: 2,
    unit: "none",
    unitLabel: "no unit",
    model: "Gradient = (11 \u2212 3) \xF7 (5 \u2212 1) = 8 \xF7 4 = 2. The coordinates have no stated units, so the gradient has no unit here.",
    trap: "Use the same coordinate order in the numerator and denominator. Do not calculate change in x \xF7 change in y."
  },
  {
    id: "gas-motion",
    subject: "Chemistry",
    command: "Describe",
    topic: "gas particles",
    topics: ["gas particles", "bonding", "solubility"],
    question: "Describe the motion of gas particles in a sealed, rigid container as the gas is heated.",
    hint: "State the direction of motion and the change in average speed.",
    placeholder: "The particles move\u2026 As the gas is heated\u2026",
    model: "The gas particles move randomly in all directions. As the gas is heated, their average speed increases.",
    criteria: ["I stated that gas particles move randomly in all directions.", "I stated that their average speed increases as the gas is heated."],
    trap: "Describe the particles\u2019 motion. Do not say the particles themselves become larger."
  },
  {
    id: "linear-graphs",
    subject: "Maths",
    command: "Compare",
    topic: "graphs",
    topics: ["angles", "graphs", "fractions"],
    question: "Compare the graphs of y = 2x + 1 and y = 2x + 4. Include one similarity and one difference.",
    hint: "Look at the coefficient of x and the constant term in each equation.",
    placeholder: "Both graphs\u2026 whereas\u2026",
    model: "Both graphs are straight lines with gradient 2, so they are parallel. The graph of y = 2x + 1 has y-intercept 1, whereas y = 2x + 4 has y-intercept 4.",
    criteria: ["I gave a correct similarity that directly refers to both graphs.", "I gave a correct difference between the two graphs (for example, their y-intercepts)."],
    trap: "Describe the relationship between the two graphs. Two separate descriptions can make the comparison unclear."
  },
  {
    id: "expanding",
    subject: "Maths",
    command: "Explain",
    topic: "expanding brackets",
    topics: ["expanding brackets", "solving inequalities", "rounding"],
    question: "Explain why expanding brackets in 3(x + 2) gives 3x + 6.",
    hint: "Say which terms the 3 multiplies.",
    placeholder: "The 3 multiplies\u2026 Therefore\u2026",
    model: "The distributive law means the 3 multiplies every term inside the brackets. Therefore 3(x + 2) = 3 \xD7 x + 3 \xD7 2 = 3x + 6.",
    criteria: ["I explained that 3 multiplies both terms inside the brackets.", "I linked that rule to 3 \xD7 x = 3x and 3 \xD7 2 = 6."],
    trap: "The result alone does not explain why it is correct. Link the multiplication rule to both terms."
  },
  {
    id: "acceleration",
    subject: "Physics",
    command: "Calculate",
    topic: "acceleration",
    topics: ["density", "acceleration", "power"],
    question: "Calculate the acceleration of a 4 kg trolley when a resultant force of 12 N acts on it.",
    hint: "Use resultant force = mass \xD7 acceleration.",
    placeholder: "F = ma, so a = \u2026\nSubstitute the values\u2026",
    expected: 3,
    unit: "m/s2",
    unitLabel: "m/s\xB2",
    model: "F = ma, so a = F \xF7 m = 12 \xF7 4 = 3 m/s\xB2.",
    trap: "Use the resultant force and divide by the mass. Acceleration is measured in m/s\xB2, not m/s."
  },
  {
    id: "translation",
    subject: "Maths",
    command: "Describe",
    topic: "translation",
    topics: ["reflection", "translation", "rotation"],
    question: "Describe the translation that maps (x, y) to (x \u2212 3, y + 2).",
    hint: "State both the horizontal and vertical movement.",
    placeholder: "Move every point\u2026",
    model: "Translate every point 3 units to the left and 2 units up. The translation vector is (\u22123, 2).",
    criteria: ["I stated that every point moves 3 units to the left.", "I stated that every point moves 2 units up."],
    trap: "Give both distance and direction. \u201CMove by 3 and 2\u201D is incomplete."
  },
  {
    id: "cells",
    subject: "Biology",
    command: "Compare",
    topic: "plant and animal cells",
    topics: ["plant and animal cells", "diffusion", "food chains"],
    question: "Compare typical plant and animal cells. Include one similarity and one difference.",
    hint: "Choose a shared structure, then a structure that differs.",
    placeholder: "Both cell types\u2026 whereas\u2026",
    model: "Both typical plant and animal cells have a nucleus, cytoplasm and a cell membrane. A plant cell has a cellulose cell wall, whereas an animal cell has no cell wall.",
    criteria: ["I gave a correct shared structure, such as a nucleus, cytoplasm or cell membrane.", "I gave a correct structural difference, directly linking the two cell types."],
    trap: "Animal cells do have a cell membrane. A cell membrane and a cell wall are different structures."
  }
];
const UNIT_OPTIONS = [
  ["none", "No unit"],
  ["m/s2", "m/s\xB2"],
  ["m/s", "m/s"],
  ["N", "N"],
  ["kg", "kg"]
];
export {
  ACTIVITIES,
  COMMANDS,
  UNIT_OPTIONS
};
