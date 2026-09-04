// components/Message.jsx
import { useState, useMemo } from 'react';
import { Pencil } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export default function Message({ msg, onEdit, streaming }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const isUser = msg.role === 'user';

  // Must run on every render, regardless of `editing` — hooks can never
  // sit after a conditional early return (Rules of Hooks).
  const processedContent = useMemo(() => preprocessMath(msg.content || ''), [msg.content]);

  if (editing) {
    return (
      <div className="flex justify-end mb-5">
        <div className="w-full">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full p-3 rounded-xl text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand-100"
            autoFocus
          />
          <div className="flex gap-3 mt-2 justify-end">
            <button onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-zinc-700">
              Cancel
            </button>
            <button
              onClick={() => { setEditing(false); onEdit(msg.id, draft); }}
              className="text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-3 py-1.5 font-medium"
            >
              Save &amp; regenerate
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex mb-5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="relative max-w-[100%]">
        <div
          className={`px-4 py-2.5 text-[14.5px] leading-relaxed prose prose-sm max-w-none ${
            isUser
              ? 'bg-brand-600 text-white prose-invert rounded-2xl rounded-br-md'
              : 'bg-white text-zinc-800 rounded-2xl rounded-bl-md'
          }`}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{msg.content}</div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[[rehypeKatex, { trust: false, throwOnError: false, strict: 'warn' }]]}
              components={markdownComponents}
            >
              {processedContent}
            </ReactMarkdown>
          )}
          {streaming && !msg.content && <TypingDots />}
        </div>
        {isUser && (
          <button
            onClick={() => setEditing(true)}
            title="Edit"
            className="absolute -left-7 top-2.5 text-zinc-400 hover:text-zinc-700 opacity-0 group-hover:opacity-100 transition"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function preprocessMath(text) {
  if (!text) return '';

  // Step 1: Display math in square brackets [ \frac{1}{2}... ] -> $$...$$
  text = text.replace(
    /\[\s*((?:\\[a-zA-Z]+(?:\{[^}]*\})?|\s|[^\]])+)\s*\]/g,
    (match, latex) => `$$${latex.trim()}$$`
  );

  // Step 2: Parenthesized LaTeX with begin/end or frac -> $$...$$
  text = text.replace(
    /\((\\(?:begin\{[a-zA-Z*]+\}|frac|tfrac|dfrac|sum|prod|int|sqrt|pmatrix|bmatrix|vmatrix|Bmatrix|Vmatrix|align|aligned|equation|gather|gathered|matrix|array|cases|split|multline|flalign)[^)]*)\)/g,
    (match, latex) => `$$${latex}$$`
  );

  // Step 3: Parenthesized math with kets/bras -> $...$
  text = text.replace(
    /\((\|[^)]+\|(?:\^\{[^}]+\}|\^\d)?[^)]*)\)/g,
    (match, inner) => {
      if (inner.includes('\\')) {
        return `$(${inner})$`;
      }
      return match;
    }
  );

  // Step 4: Bare kets/bras NOT already in $...$ -> wrap in $
  text = text.replace(
    /(?<!\$)(\|(?:\\?[a-zA-Z+\-^*\d]+)?\\rangle)(?!\$)/g,
    '$$1$'
  );
  text = text.replace(
    /(?<!\$)(\\langle(?:\\?[a-zA-Z+\-^*\d]+)?\|)(?!\$)/g,
    '$$1$'
  );

  // Step 5: Wrap common LaTeX commands NOT already in math mode
  const commands = [
    'alpha','beta','gamma','delta','epsilon','zeta','eta','theta','iota','kappa',
    'lambda','mu','nu','xi','pi','rho','sigma','tau','upsilon','phi','chi','psi','omega',
    'Gamma','Delta','Theta','Lambda','Xi','Pi','Sigma','Upsilon','Phi','Psi','Omega',
    'frac','tfrac','dfrac','sqrt','sum','prod','int','lim','sin','cos','tan','log','ln','exp',
    'mod','pmod','bmod','pm','mp','times','div','cdot','leq','geq','neq','approx','equiv',
    'in','notin','subset','supset','cup','cap','setminus','emptyset','infty','nabla','partial',
    'hbar','ell','wp','Re','Im','forall','exists','nexists','therefore','because',
    'vdots','cdots','ldots','ddots','quad','qquad','left','right','bigl','bigr','Bigl','Bigr',
    'biggl','biggr','Biggl','Biggr','langle','rangle','lceil','rceil','lfloor','rfloor',
    'vert','Vert','mid','overline','underline','widehat','widetilde','vec','hat','bar',
    'tilde','dot','ddot','mathring','check','breve','acute','grave','mathrm','mathit',
    'mathbf','mathcal','mathbb','mathfrak','text','textbf','textit','texttt','operatorname',
    'begin','end','hline','cline','multicolumn','multirow','vspace','hspace','smallskip',
    'medskip','bigskip','newline','displaystyle','textstyle','scriptstyle','scriptscriptstyle',
    'limits','nolimits','displaylimits','mathop','mathbin','mathrel','mathopen','mathclose',
    'mathpunct','mathord','mathinner','mathpalette','mathclap','mathllap','mathrlap','smash',
    'llap','rlap','clap','xleftarrow','xrightarrow','xleftrightarrow','xLeftarrow','xRightarrow',
    'xLeftrightarrow','xhookleftarrow','xhookrightarrow','xmapsto','xtofrom','xlongequal',
    'xrightleftharpoons','xleftrightharpoons','xRsh','xLsh','xrightarrowtail','xleftarrowtail',
    'xtwoheadleftarrow','xtwoheadrightarrow','underleftarrow','underrightarrow','underleftrightarrow',
    'overleftarrow','overrightarrow','overleftrightarrow','underbrace','overbrace','underbracket',
    'overbracket','underbar','overbar','overset','underset','stackrel','stackbin','sideset',
    'prescript','mathchoice','binom','dbinom','tbinom','genfrac','cfrac','over','atop','above',
    'brace','brack','choose','buildrel','relbar','Relbar','arrowvert','Arrowvert','bracevert',
    'lvert','rvert','lVert','rVert','surd','root','mod','bmod','pmod','pod','aleph','imath',
    'jmath','angle','measuredangle','sphericalangle','top','bot','vdash','dashv','perp',
    'parallel','nparallel','bowtie','Join','ltimes','rtimes','prec','succ','preceq','succeq',
    'll','gg','lll','ggg','lesssim','gtrsim','lessgtr','gtrless','doteq','eqcirc','circeq',
    'bumpeq','Bumpeq','between','pitchfork','propto','varpropto','backepsilon','cramped',
    'crampedclap','crampedllap','crampedrlap'
  ];

  for (const cmd of commands) {
    const pattern = new RegExp('(?<!\\$)(\\\\' + cmd + '(?:\{[^}]*\})*)(?!\\$)', 'g');
    text = text.replace(pattern, (match) => {
      if (match.startsWith('$') || match.endsWith('$')) return match;
      return `$${match}$`;
    });
  }

  // Step 6: Clean up double/triple-wrapped math
  text = text.replace(/\$\$\$([^$]+)\$\$\$/g, '$$$1$$');
  text = text.replace(/\$\$\$\$([^$]+)\$\$\$\$/g, '$$$$1$$');

  return text;
}

const markdownComponents = {
  table: ({node, ...props}) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border border-zinc-200 rounded-lg" {...props} />
    </div>
  ),
  thead: ({node, ...props}) => <thead className="bg-zinc-50" {...props} />,
  th: ({node, ...props}) => (
    <th className="px-4 py-2 text-left text-sm font-semibold border-b border-zinc-200" {...props} />
  ),
  td: ({node, ...props}) => (
    <td className="px-4 py-2 text-sm border-b border-zinc-200" {...props} />
  ),
  br: ({node, ...props}) => <br {...props} />,
  p: ({node, ...props}) => <p className="my-1.5" {...props} />,
  ul: ({node, ...props}) => <ul className="list-disc ml-4 my-2 space-y-1" {...props} />,
  ol: ({node, ...props}) => <ol className="list-decimal ml-4 my-2 space-y-1" {...props} />,
  li: ({node, ...props}) => <li className="my-1" {...props} />,
  h1: ({node, ...props}) => <h1 className="text-xl font-bold my-3" {...props} />,
  h2: ({node, ...props}) => <h2 className="text-lg font-bold my-2" {...props} />,
  h3: ({node, ...props}) => <h3 className="text-base font-bold my-2" {...props} />,
  h4: ({node, ...props}) => <h4 className="text-sm font-bold my-2" {...props} />,
  blockquote: ({node, ...props}) => (
    <blockquote className="border-l-4 border-brand-400 pl-4 my-2 text-zinc-600" {...props} />
  ),
  code: ({node, inline, className, children, ...props}) => {
    const match = /language-(\w+)/.exec(className || '');
    return inline 
      ? <code className="bg-zinc-100 px-1 py-0.5 rounded text-sm" {...props}>{children}</code>
      : <pre className="block bg-zinc-100 p-3 rounded-lg my-2 text-sm overflow-x-auto"><code className={match ? `language-${match[1]}` : ''} {...props}>{children}</code></pre>;
  },
  a: ({node, ...props}) => (
    <a className="text-brand-600 hover:text-brand-700 underline" target="_blank" rel="noopener noreferrer" {...props} />
  ),
  strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
  em: ({node, ...props}) => <em className="italic" {...props} />,
  hr: ({node, ...props}) => <hr className="my-4 border-zinc-200" {...props} />,
};

function TypingDots() {
  return (
    <span className="inline-flex gap-1 items-center h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}