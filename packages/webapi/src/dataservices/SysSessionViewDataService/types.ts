/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

/**
 * @export
 * @interface ISysSessionViewDataServiceFindSessionByOidcClientAndSubjectParams
 */
export interface ISysSessionViewDataServiceFindSessionByOidcClientAndSubjectParams {
	/**
	 * @type string
	 * @memberOf ISysSessionViewDataServiceFindSessionByOidcClientAndSubjectParams
	 */
	sub_claim: string;
	/**
	 * @type string
	 * @memberOf ISysSessionViewDataServiceFindSessionByOidcClientAndSubjectParams
	 */
	client_id: string;
}

/**
 * @export
 * @interface ISysSessionViewDataServiceFindSessionByClientAndUserParams
 */
export interface ISysSessionViewDataServiceFindSessionByClientAndUserParams {
	/**
	 * @type string
	 * @memberOf ISysSessionViewDataServiceFindSessionByClientAndUserParams
	 */
	user_id: string;
	/**
	 * @type string
	 * @memberOf ISysSessionViewDataServiceFindSessionByClientAndUserParams
	 */
	client_id: string;
}

/**
 * @export
 * @interface ISysSessionViewDataServiceFindSessionBySessionIdParams
 */
export interface ISysSessionViewDataServiceFindSessionBySessionIdParams {
	/**
	 * @type string
	 * @memberOf ISysSessionViewDataServiceFindSessionBySessionIdParams
	 */
	id: string;
}
