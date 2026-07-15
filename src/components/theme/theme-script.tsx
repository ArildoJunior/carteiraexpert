/**
 * Script inline que aplica o tema antes do React hidratar.
 * Evita o flash de tema errado (FOUC) no carregamento inicial.
 * Deve ser colocado DENTRO do <head>, antes do ThemeProvider.
 */
export function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem("theme");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}var d=t==="dark";document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=t}catch(e){}})()`;

  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: necessário para inlining de script anti-flash
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}
