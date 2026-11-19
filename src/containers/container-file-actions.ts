/**
 * Injected boundary between the graph tree and vault file actions.
 *
 * The tree knows only which action a row offers and asks the seam to perform
 * it. The presenter supplies the implementation; JSON presentation supplies
 * none.
 */

import type { ContainerIdentity } from "../graph/types";


/** File action offered by one container row. */
export type ContainerFileAction = "open" | "create";


/** Vault file actions for container rows. */
export interface ContainerFileActions {
    /** Return whether the row opens an existing file or creates one. */
    actionFor(identity: ContainerIdentity): ContainerFileAction;

    /** Open or create the file for one row. */
    activate(identity: ContainerIdentity): Promise<void>;
}
