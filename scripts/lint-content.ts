import { lintQuestions } from '../src/content/lint'
import { questions } from '../src/content/questions'
import { termById } from '../src/content/terms'

const issues = lintQuestions(questions, termById)
if (issues.length) {
  for (const i of issues) console.error(`${i.questionId}: ${i.message}`)
  console.error(`\n${issues.length} content issue(s)`)
  process.exit(1)
}
console.log(`${questions.length} questions, ${termById.size} terms: content OK`)
