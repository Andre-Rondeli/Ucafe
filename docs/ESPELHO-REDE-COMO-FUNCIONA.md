# Seus produtos nas lojas da rede — como funciona

> Este documento explica a mudança para quem usa o app. A versão para quem constrói é
> [ESPELHO-REDE-TECNICO.md](ESPELHO-REDE-TECNICO.md).

## O que muda no seu dia

Para saber como os seus produtos estão indo nas lojas da rede, alguém precisa pedir um
relatório, esperar, e abrir uma planilha.

Aqui **o app sabe sozinho**. Toda manhã, antes de o comércio abrir, ele busca no ProcessDesk
(o sistema da rede) quanto dos seus produtos saiu em cada loja no dia anterior e quanto
ainda tem lá — e guarda essa informação dentro do próprio app.

Você abre o app e vê primeiro **a rede inteira** — quanto ela vendeu no período,
quanto tem em estoque somando as lojas, e para quantos dias isso dá. Embaixo, **loja a
loja**; e tocando numa loja ela **abre produto por produto**.

Em cada nível — rede, loja e produto — os mesmos três números:

- **Quanto vendeu** — quantos pacotes saíram e quanto isso deu em reais
- **Quanto ainda tem** — o estoque
- **Para quantos dias dá** — se vende 10 pacotes por dia e tem 30 em estoque, dá 3 dias.
  Loja com menos de 7 dias aparece marcada como **apertada**, e o total da rede conta
  quantas estão assim.

O total de uma loja é sempre **exatamente a soma dos produtos que ela abre** — se não fosse,
um dos dois estaria errado e não haveria como saber qual olhando a tela.

⚠️ **Centro de distribuição fica numa lista separada, e não entra no total da rede.** A
saída de um CD abastece as lojas; somá-la com a venda da loja contaria o mesmo café duas
vezes.

## De onde vem esse número

Do **Consinco**, o ERP que controla as lojas da rede. O ProcessDesk já recebe esse dado todo
dia, e este app recebe uma cópia — só da parte que é sua.

Não é estimativa nem projeção. É o que passou no caixa e o que está na prateleira.

## O que o app vê, e o que ele não vê

**Vê:** só os produtos da sua indústria, cadastrados do lado do ProcessDesk. Quantidade
vendida, valor em reais e estoque, loja por loja, dia a dia.

**Não vê:** nada de outra marca, nada do resto da loja, e nenhuma informação de custo ou de
margem da rede. O app enxerga os seus produtos e mais nada.

É de propósito: se um dia essa ligação for usada indevidamente, o que está do outro lado são
os seus próprios produtos — não o negócio da rede.

## Quando o dado é atualizado

**Uma vez por dia, às 6h30 da manhã** (horário da Bahia). O horário não é por acaso: o
ProcessDesk termina de receber a carga do Consinco às 6h, e o app busca logo depois —
antes de qualquer pessoa abrir a tela.

Se você abrir o app às 10h, está vendo o fechamento do dia anterior. **A tela mostra sempre
a data do dado**, para não haver dúvida sobre o quanto ele é recente.

## Duas coisas que vale entender para não ler errado

**1. O estoque é a foto da abertura do dia.** Não é o estoque "agora, neste minuto". É
quanto a loja tinha quando abriu. Durante o dia ela vende, e o número real cai — o app só
saberá disso na atualização de amanhã.

**2. Dia sem venda aparece vazio, não zero.** Se o app mostrar em branco, quer dizer "não
houve venda registrada nesse dia nessa loja". Zero seria uma afirmação, e afirmar venda zero
onde o dado simplesmente não chegou é o tipo de erro que faz decidir errado.

## Quando alguma coisa der errado

O app não finge que está tudo bem. Se a busca da manhã falhar, a tela avisa que o dado é de
ontem — em vez de mostrar número velho com cara de novo.

E há uma trava proposital: se o ProcessDesk responder sem nenhuma venda, o app **não apaga**
o que já tinha. Origem vazia não é o mesmo que "não vendeu nada" — pode ser falha no meio do
caminho. Nesse caso o app mantém o histórico e registra o erro.

## O que esta entrega ainda não faz

- **Não avisa sozinho.** Se um produto acabar numa loja, o app mostra na tela, mas não manda
  aviso no celular. Isso é a decisão seguinte — e agora fica fácil, porque o dado já está
  dentro de casa.
- **Não mostra concorrente.** O app não sabe como as outras marcas estão indo nas lojas.
- **Não mexe em nada na rede.** A ligação é de leitura: o app lê o ProcessDesk e nunca
  escreve nele.
