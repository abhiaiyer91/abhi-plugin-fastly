import { HEADER_COMMENT } from "./constants";
import { exists, readFile, writeFile } from "fs-extra";

export default async function writeRedirectsFile(
  pluginData,
  redirects,
  rewrites
) {
  const { publicFolder } = pluginData;

  if (!redirects.length && !rewrites.length) return null;

  const FILE_PATH = publicFolder(`_redirects`);

  const redirectStrings = redirects.map((redirect) => {
    const { fromPath, isPermanent, force, toPath, statusCode } = redirect;

    let status = isPermanent ? `301` : `302`;
    if (statusCode) status = String(statusCode);

    if (force) status = `${status}!`;

    return `"${fromPath}": "${toPath}"`;
  });

  rewrites = rewrites.map(
    ({ fromPath, toPath }) => `${fromPath}  ${toPath}  200`
  );

  // Websites may also have statically defined redirects
  // In that case we should append to them (not overwrite)
  // Make sure we aren't just looking at previous build results though

  const redirectsTable = `table redirectsTable {\n${redirectStrings.join(
    `\n`
  )}\n}\nif (table.lookup(solution_redirects, req.url.path)) {\nerror 718 "redirect";\n}`;

  const redirectsRouting = `
    ${redirects.map(({ fromPath, isPermanent, force, toPath, statusCode }) => {
      let status = isPermanent ? `301` : `302`;
      if (statusCode) status = String(statusCode);
      return `
        if (obj.status == 718 && obj.response == "redirect" && req.url.path ~ ${fromPath}) {
          set obj.status = ${status};
          set obj.http.Location = "https://" + req.http.host + table.lookup(solution_redirects, req.url.path) + if (req.url.qs, "?" req.url.qs, "");
          return (deliver);
        }
      `;
    })}`;

  return writeFile(
    FILE_PATH,
    [redirectsTable, redirectsRouting, ...rewrites].join(`\n`)
  );
}
