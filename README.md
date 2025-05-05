

## Instructions
- clone this repo
- npm install
- npm run build
- npm run dev
## Go to google chrome
- go to extensions
- turn on developer mode
- load unpacked
- select ai-waste-watcher -> select dist
- open dist

Go to a site like claude or gemini and see how much resources get used per prompt


## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Inspiration
Recently, OpenAI CEO Sam Altman said on social media that saying "please" and "thank you" to ChatGPT has cost the company "tens of millions".  Reading his casual tweet, we were inspired to develop our initial plan: find out the true cost of Thank You. As we continued to figure out our purpose with this extension, we stumbled upon another invisible cost, invisible in the sense of consumer awareness, the environmental cost of prompts. According to the research by Washington Post, ChatGPT 4.0 consumes 519 milliliters or just over one bottle of water, to write a 100-word email. Now imagine, what is the global cost of runningChatGPT in one day, one week, one month, or even a year? Business Energy UK outlined the cost in an infographic. 

Below outlines the energy used in KWH:

- 39.98 Million KWH Per Day -> Can charge over 8 Million Phones
- 279.86 Million KWH Per Week -> Can power Las Vegas Sphere for 3 years
- 1.199 Billion KWH Per Month-> Power Times Square Billboards for 20 years
- 14.46 Billion KWH Per Year -> More than 117 countries’ electricity consumption in a year

## What it does

wAIsted is a Chrome extension that provides real-time tracking of the cost of using different AI models. Through tracking tokens for each user prompt, the algorithm calculates the total cost, energy, carbon, and water usage. The math is sourced from ePoch.ai's How much energy does ChatGPT use?

## How we built it

We used React, Vite, and Tailwind to build the front end of the Chrome extension. We use JavaScript to implement the math behind each calculation. The biggest challenge we ran into was reading the response tokens from user input.

## What's next for wAIsted

- Usage Caps: Allow users to set boundaries for how much AI to use daily/week.
- Efficiency Badges: Gameify prompt engineering and encourage shorter, more concise prompts
- Eco-friendly Recommendations: Analyse the user's prompts in accordance to AI model and suggest other ways for a user to gather this data (for example, simple calculations can be done on the Calculator App)



