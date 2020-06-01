import { HEADER_COMMENT } from "./constants";
import { exists, readFile, writeFile } from "fs-extra";

export default async function writeRedirectsFile(
  pluginData,
  redirects,
  rewrites
) {
  const { publicFolder } = pluginData;

  if (!redirects.length && !rewrites.length) return null;

  // TODO Need to figure out how to set this for fastly, assume this isn't the _redirects file
  const FILE_PATH = publicFolder(`_redirects`);

  let vclRedirects = [];

  redirects.forEach((redirect) => {
    const { fromPath, isPermanent, force, toPath, statusCode } = redirect;

    let status = isPermanent ? `301` : `302`;
    if (statusCode) status = String(statusCode);

    // TODO - What does a force look like in fastly vcl?
    //   if (force) status = `${status}!`;

    vclRedirects.push({
      fromPath,
      toPath,
      status,
    });
  });

  rewrites.forEach(({ fromPath, toPath }) =>
    vclRedirects.push({
      fromPath,
      toPath,
      status: `200`,
    })
  );

  // TODO This is only relevant if we support a separate vcl file
  // Websites may also have statically defined redirects
  // In that case we should append to them (not overwrite)
  // Make sure we aren't just looking at previous build results though

  // TODO ?do we want to support both a .vcl and the defined redirects? Doesn't seem like a good idea
  // unless fastly supports multiple .vcl files.

  const redirectsTable = `table redirects {
    ${vclRedirects
      .map(({ fromPath, toPath }) => `"${fromPath}", "${toPath}",`)
      .join("\n")};
  }`;

  const redirectTypesTable = `table redirect_types {
    ${vclRedirects
      .map(({ fromPath, status }) => `"${fromPath}", "${status}",`)
      .join("\n")};
  }`;

  const vclRecv = `sub vcl_recv {
    if(table.lookup(redirects, req.url)) {
      error 777
    }
  }`;

  // TODO Can we just use the strings they give us? If there is no http/https will it work?
  const vclError = `sub vcl_error {
    if (obj.status === 777) {
      set obj.http.Location = table.lookup(redirects, req.url);
      set obj.status = std.atoi(table.lookup(redirect_types, req.url, "302"));
      return(deliver);
    }
  }`;

  // These changes are based on this file https://gist.github.com/mshmsh5000/130300bbe6f574dbf846ac6cd24b7cc5

  return writeFile(
    FILE_PATH,
    [redirectsTable, redirectTypesTable, vclRecv, vclError].join(`\n\n`)
  );
}
