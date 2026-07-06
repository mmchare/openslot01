import { defineMcp } from "@lovable.dev/mcp-js";
import listCatalog from "./tools/list-catalog";
import getProduct from "./tools/get-product";

export default defineMcp({
  name: "openslot-mcp",
  title: "OpenSlot MCP",
  version: "0.1.0",
  instructions:
    "Tools for the OpenSlot catalog. Use `list_catalog` to browse products (streaming accounts and APKs), and `get_product` to fetch details for a specific product by UUID.",
  tools: [listCatalog, getProduct],
});
