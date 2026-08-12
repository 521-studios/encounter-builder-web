// Build a monster's ContentRef from its applied-template stack — the round-trip
// contract the template feature rests on:
//   empty stack -> pristine  { game_id }
//   non-empty   -> derived   { base:{game_id}, modifications:[{template_game_id,
//                              template_name}], json:<last resolved creature> }
// json is the resolved snapshot for downstream/released consumers; modifications
// are the provenance MonsterView re-applies to reconstruct the stack on load.
export function buildMonsterRef(baseGameId, stack) {
  if (!stack || stack.length === 0) return { game_id: baseGameId }
  return {
    base: { game_id: baseGameId },
    modifications: stack.map((s) => ({
      template_game_id: s.template.game_id,
      template_name: s.template.name,
    })),
    json: stack[stack.length - 1].creature,
  }
}
