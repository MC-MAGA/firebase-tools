import { expect } from "chai";
import * as sinon from "sinon";

import {
  ask,
  askForParam,
  checkResponse,
  getInquirerDefault,
  SecretLocation,
} from "./askUserForParam";
import * as utils from "../utils";
import * as prompt from "../prompt";
import { ParamType } from "./types";
import * as extensionsHelper from "./extensionsHelper";
import * as secretManagerApi from "../gcp/secretManager";
import * as secretsUtils from "./secretsUtils";

describe("askUserForParam", () => {
  const testSpec = {
    param: "NAME",
    type: ParamType.STRING,
    label: "Name",
    default: "Lauren",
    validationRegex: "^[a-z,A-Z]*$",
  };

  describe("checkResponse", () => {
    let logWarningSpy: sinon.SinonSpy;
    beforeEach(() => {
      logWarningSpy = sinon.spy(utils, "logWarning");
    });

    afterEach(() => {
      logWarningSpy.restore();
    });

    it("should return false if required variable is not set", () => {
      expect(
        checkResponse("", {
          param: "param",
          label: "fill in the blank!",
          type: ParamType.STRING,
          required: true,
        }),
      ).to.equal(false);
      expect(
        logWarningSpy.calledWith(`Param param is required, but no value was provided.`),
      ).to.equal(true);
    });

    it("should return false if regex validation fails", () => {
      expect(
        checkResponse("123", {
          param: "param",
          label: "fill in the blank!",
          type: ParamType.STRING,
          validationRegex: "foo",
          required: true,
        }),
      ).to.equal(false);
      const expectedWarning = `123 is not a valid value for param since it does not meet the requirements of the regex validation: "foo"`;
      expect(logWarningSpy.calledWith(expectedWarning)).to.equal(true);
    });

    it("should return false if regex validation fails on an optional param that is not empty", () => {
      expect(
        checkResponse("123", {
          param: "param",
          label: "fill in the blank!",
          type: ParamType.STRING,
          validationRegex: "foo",
          required: false,
        }),
      ).to.equal(false);
      const expectedWarning = `123 is not a valid value for param since it does not meet the requirements of the regex validation: "foo"`;
      expect(logWarningSpy.calledWith(expectedWarning)).to.equal(true);
    });

    it("should return true if no value is passed for an optional param", () => {
      expect(
        checkResponse("", {
          param: "param",
          label: "fill in the blank!",
          type: ParamType.STRING,
          validationRegex: "foo",
          required: false,
        }),
      ).to.equal(true);
    });

    it("should not check against list of options if no value is passed for an optional SELECT", () => {
      expect(
        checkResponse("", {
          param: "param",
          label: "fill in the blank!",
          type: ParamType.SELECT,
          required: false,
          options: [{ value: "aaa" }, { value: "bbb" }, { value: "ccc" }],
        }),
      ).to.equal(true);
    });

    it("should not check against list of options if no value is passed for an optional MULTISELECT", () => {
      expect(
        checkResponse("", {
          param: "param",
          label: "fill in the blank!",
          type: ParamType.MULTISELECT,
          required: false,
          options: [{ value: "aaa" }, { value: "bbb" }, { value: "ccc" }],
        }),
      ).to.equal(true);
    });

    it("should use custom validation error message if provided", () => {
      const message = "please enter a word with foo in it";
      expect(
        checkResponse("123", {
          param: "param",
          label: "fill in the blank!",
          type: ParamType.STRING,
          validationRegex: "foo",
          validationErrorMessage: message,
          required: true,
        }),
      ).to.equal(false);
      expect(logWarningSpy.calledWith(message)).to.equal(true);
    });

    it("should return true if all conditions pass", () => {
      expect(
        checkResponse("123", {
          param: "param",
          label: "fill in the blank!",
          type: ParamType.STRING,
        }),
      ).to.equal(true);
      expect(logWarningSpy.called).to.equal(false);
    });

    it("should return false if an invalid choice is selected", () => {
      expect(
        checkResponse("???", {
          param: "param",
          label: "pick one!",
          type: ParamType.SELECT,
          options: [{ value: "aaa" }, { value: "bbb" }, { value: "ccc" }],
        }),
      ).to.equal(false);
    });

    it("should return true if an valid choice is selected", () => {
      expect(
        checkResponse("aaa", {
          param: "param",
          label: "pick one!",
          type: ParamType.SELECT,
          options: [{ value: "aaa" }, { value: "bbb" }, { value: "ccc" }],
        }),
      ).to.equal(true);
    });

    it("should return false if multiple invalid choices are selected", () => {
      expect(
        checkResponse("d,e,f", {
          param: "param",
          label: "pick multiple!",
          type: ParamType.MULTISELECT,
          options: [{ value: "aaa" }, { value: "bbb" }, { value: "ccc" }],
        }),
      ).to.equal(false);
    });

    it("should return true if one valid choice is selected", () => {
      expect(
        checkResponse("ccc", {
          param: "param",
          label: "pick multiple!",
          type: ParamType.MULTISELECT,
          options: [{ value: "aaa" }, { value: "bbb" }, { value: "ccc" }],
        }),
      ).to.equal(true);
    });

    it("should return true if multiple valid choices are selected", () => {
      expect(
        checkResponse("aaa,bbb,ccc", {
          param: "param",
          label: "pick multiple!",
          type: ParamType.MULTISELECT,
          options: [{ value: "aaa" }, { value: "bbb" }, { value: "ccc" }],
        }),
      ).to.equal(true);
    });
  });

  describe("getInquirerDefaults", () => {
    it("should return the label of the option whose value matches the default", () => {
      const options = [
        { label: "lab", value: "val" },
        { label: "lab1", value: "val1" },
      ];
      const def = "val1";

      const res = getInquirerDefault(options, def);

      expect(res).to.equal("lab1");
    });

    it("should return the value of the default option if it doesnt have a label", () => {
      const options = [{ label: "lab", value: "val" }, { value: "val1" }];
      const def = "val1";

      const res = getInquirerDefault(options, def);

      expect(res).to.equal("val1");
    });

    it("should return an empty string if a default option is not found", () => {
      const options = [{ label: "lab", value: "val" }, { value: "val1" }];
      const def = "val2";

      const res = getInquirerDefault(options, def);

      expect(res).to.equal("");
    });
  });
  describe("askForParam with string param", () => {
    let inputStub: sinon.SinonStub;

    beforeEach(() => {
      inputStub = sinon.stub(prompt, "input");
      inputStub.onCall(0).returns("Invalid123");
      inputStub.onCall(1).returns("InvalidStill123");
      inputStub.onCall(2).returns("ValidName");
    });

    afterEach(() => {
      inputStub.restore();
    });

    it("should keep prompting user until valid input is given", async () => {
      await askForParam({
        projectId: "project-id",
        instanceId: "instance-id",
        paramSpec: testSpec,
        reconfiguring: false,
      });
      expect(inputStub).to.be.calledThrice;
    });
  });

  describe("askForParam with secret param", () => {
    const stubSecret = {
      name: "new-secret",
      projectId: "firebase-project-123",
    };
    const stubSecretVersion = {
      secret: stubSecret,
      versionId: "1.0.0",
    };
    const secretSpec = {
      param: "API_KEY",
      type: ParamType.SECRET,
      label: "API Key",
      default: "XXX.YYY",
    };

    let checkboxStub: sinon.SinonStub;
    let inputStub: sinon.SinonStub;
    let confirmStub: sinon.SinonStub;
    let passwordStub: sinon.SinonStub;
    let createSecret: sinon.SinonStub;
    let secretExists: sinon.SinonStub;
    let addVersion: sinon.SinonStub;
    let grantRole: sinon.SinonStub;

    beforeEach(() => {
      checkboxStub = sinon.stub(prompt, "checkbox");
      inputStub = sinon.stub(prompt, "input");
      confirmStub = sinon.stub(prompt, "confirm");
      passwordStub = sinon.stub(prompt, "password");
      secretExists = sinon.stub(secretManagerApi, "secretExists");
      createSecret = sinon.stub(secretManagerApi, "createSecret");
      addVersion = sinon.stub(secretManagerApi, "addVersion");
      grantRole = sinon.stub(secretsUtils, "grantFirexServiceAgentSecretAdminRole");

      secretExists.onCall(0).resolves(false);
      createSecret.onCall(0).resolves(stubSecret);
      addVersion.onCall(0).resolves(stubSecretVersion);
      grantRole.onCall(0).resolves(undefined);
    });

    afterEach(() => {
      checkboxStub.restore();
      inputStub.restore();
      confirmStub.restore();
      passwordStub.restore();
      secretExists.restore();
      createSecret.restore();
      addVersion.restore();
      grantRole.restore();
    });

    it("should return the correct user input for secret stored with Secret Manager", async () => {
      confirmStub.onFirstCall().resolves(true);
      checkboxStub.onFirstCall().resolves([SecretLocation.CLOUD.toString()]);
      passwordStub.onFirstCall().resolves("ABC.123");

      const result = await askForParam({
        projectId: "project-id",
        instanceId: "instance-id",
        paramSpec: secretSpec,
        reconfiguring: false,
      });

      // prompt for secret storage location, then prompt for secret value
      expect(checkboxStub).to.be.calledOnce;
      expect(passwordStub).to.be.calledOnce;
      expect(grantRole).to.be.calledOnce;
      expect(result).to.be.eql({
        baseValue: `projects/${stubSecret.projectId}/secrets/${stubSecret.name}/versions/${stubSecretVersion.versionId}`,
      });
    });

    it("should return the correct user input for secret stored in a local file", async () => {
      confirmStub.onFirstCall().resolves(true);
      checkboxStub.onFirstCall().resolves([SecretLocation.LOCAL.toString()]);
      inputStub.onFirstCall().resolves("ABC.123");

      const result = await askForParam({
        projectId: "project-id",
        instanceId: "instance-id",
        paramSpec: secretSpec,
        reconfiguring: false,
      });
      // prompt for secret storage location, then prompt for secret value
      expect(checkboxStub).to.be.called.calledOnce;
      expect(inputStub).to.be.calledOnce;
      expect(passwordStub).to.not.have.been.called;
      // Shouldn't make any api calls.
      expect(grantRole).to.not.have.been.called;
      expect(result).to.be.eql({
        baseValue: "",
        local: "ABC.123",
      });
    });

    it("should handle cloud & local secret storage at the same time", async () => {
      checkboxStub
        .onFirstCall()
        .returns([SecretLocation.CLOUD.toString(), SecretLocation.LOCAL.toString()]);
      inputStub.onFirstCall().returns("local");
      passwordStub.onFirstCall().returns("ABC.123");
      inputStub.onFirstCall().returns("LOCAL.ABC.123");

      const result = await askForParam({
        projectId: "project-id",
        instanceId: "instance-id",
        paramSpec: secretSpec,
        reconfiguring: false,
      });
      // prompt for secret storage location, then prompt for cloud secret value, then local
      expect(checkboxStub).to.have.been.calledOnce;
      expect(passwordStub).to.have.been.calledOnce;
      expect(inputStub).to.have.been.calledOnce;
      expect(grantRole).to.have.been.calledOnce;
      expect(result).to.be.eql({
        baseValue: `projects/${stubSecret.projectId}/secrets/${stubSecret.name}/versions/${stubSecretVersion.versionId}`,
        local: "LOCAL.ABC.123",
      });
    });
  });

  describe("ask", () => {
    let subVarSpy: sinon.SinonSpy;
    let promptStub: sinon.SinonStub;

    beforeEach(() => {
      subVarSpy = sinon.spy(extensionsHelper, "substituteParams");
      promptStub = sinon.stub(prompt, "input").resolves("ValidName");
    });

    afterEach(() => {
      subVarSpy.restore();
      promptStub.restore();
    });

    it("should call substituteParams with the right parameters", async () => {
      const spec = [testSpec];
      const firebaseProjectVars = { PROJECT_ID: "my-project" };
      await ask({
        projectId: "project-id",
        instanceId: "instance-id",
        paramSpecs: spec,
        firebaseProjectParams: firebaseProjectVars,
        reconfiguring: false,
      });
      expect(subVarSpy.calledWith(spec, firebaseProjectVars)).to.be.true;
    });
  });
});
