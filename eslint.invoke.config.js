// Barreira: `supabase.functions.invoke` chamado sem tratar o `error`.
//
// POR QUE ISTO EXISTE, e nao mais um mutirao daqui a tres meses:
//
// `functions.invoke` NAO lanca. Devolve `{ data, error }`. Quem escreve
// `await supabase.functions.invoke(...)` sem pegar o `error` nasce quebrado:
// a chamada falha e o codigo segue para o `toast.success`. Foi assim que
// "Instancia deletada" apareceu para instancia que ficou de pe e
// "Indice atualizado com sucesso!" para analise que nao rodou.
//
// E em resposta nao-2xx o `error.message` e sempre a frase fixa
// "Edge Function returned a non-2xx status code" — o motivo real fica em
// `error.context`. Desembrulhar isso e trabalho de `src/lib/functionError.ts`.
//
// Consertar os 44 pontos vale pouco; o que vale e o proximo ponto nao nascer.
// Roda no CI por `npm run lint:invoke` — config SEPARADA do lint geral de
// proposito: o lint geral tem 109 erros de base (`no-explicit-any`) e um portao
// que ja esta vermelho nao segura nada.
//
// Dispensa legitima (fire-and-forget de verdade, onde ninguem ve o resultado)
// se escreve na linha, e fica greppavel:
//
//     // eslint-disable-next-line no-restricted-syntax -- fire-and-forget
//
// Se a dispensa precisar de mais de uma linha de justificativa, provavelmente
// nao e dispensa.

import tsparser from "@typescript-eslint/parser";
import tseslint from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

const INVOKE = "[callee.property.name='invoke'][callee.object.property.name='functions']";

const MSG_DESCARTADO =
    "`supabase.functions.invoke` nao lanca: sem pegar o `error`, uma chamada que falhou segue " +
    "como se tivesse dado certo. Desestruture `{ data, error }` e desembrulhe com " +
    "`mensagemDoErroDaFuncao` (src/lib/functionError.ts). Fire-and-forget de verdade: " +
    "// eslint-disable-next-line no-restricted-syntax -- fire-and-forget";

const MSG_SEM_ERROR =
    "Destructuring de `supabase.functions.invoke` sem `error`. Em resposta nao-2xx o `data` vem " +
    "`null`, entao `if (data?.error)` nunca dispara — o motivo esta em `error.context`. " +
    "Pegue o `error` e passe por `mensagemDoErroDaFuncao` (src/lib/functionError.ts).";

export default [
    {
        files: ["src/**/*.{ts,tsx}"],
        // O helper e o unico lugar que pode mexer no erro cru.
        ignores: ["src/lib/functionError.ts"],
        // Os `eslint-disable` do codigo apontam regras do lint GERAL, que aqui
        // nao estao ligadas. Sem isto o portao acusa 31 diretivas "inuteis" que
        // sao uteis no outro config — barulho que ensina a ignorar a saida.
        linterOptions: { reportUnusedDisableDirectives: "off" },
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                ecmaFeatures: { jsx: true },
            },
        },
        // Os plugins entram SEM NENHUMA REGRA LIGADA. Sao so para os
        // `eslint-disable` que ja existem no codigo resolverem o nome da regra:
        // sem eles o ESLint aborta com "Definition for rule ... was not found"
        // em 33 arquivos e o portao morre antes de olhar um `invoke` sequer.
        plugins: {
            "@typescript-eslint": tseslint,
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            "no-restricted-syntax": [
                "error",
                // 1. resultado jogado fora inteiro — `await supabase.functions.invoke(...)`
                //    sozinho numa linha. `.catch(...)` nao cai aqui (o no da vez e o
                //    `catch`, nao o `invoke`), que e o fire-and-forget escrito de proposito.
                {
                    selector: `ExpressionStatement > AwaitExpression > CallExpression${INVOKE}`,
                    message: MSG_DESCARTADO,
                },
                {
                    selector: `ExpressionStatement > CallExpression${INVOKE}`,
                    message: MSG_DESCARTADO,
                },
                // 2. desestruturou, mas deixou o `error` de fora.
                {
                    selector:
                        `VariableDeclarator[init.type='AwaitExpression'][init.argument.callee.property.name='invoke']` +
                        `[init.argument.callee.object.property.name='functions']` +
                        ` > ObjectPattern:not(:has(Property[key.name='error']))`,
                    message: MSG_SEM_ERROR,
                },
            ],
        },
    },
];
