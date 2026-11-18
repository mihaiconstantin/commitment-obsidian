/**
 * Replaceable presentation seam for one derived commitment graph.
 */

import type { Diagnostic } from "./graph-types";
import type { CommitmentGraph } from "./commitment-graph";


/** Presents a graph without retrieving, building, or persisting it. */
export interface GraphPresenter {
    /** Display one graph and its nonblocking findings. */
    show(graph: CommitmentGraph, diagnostics: readonly Diagnostic[]): void;
}
